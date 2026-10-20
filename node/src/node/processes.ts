import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile, readlink, rename, unlink, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const EXIT_WAIT_MS = 3000;

export interface ProcessSnapshot {
  name: string;
  cmd: string;
  osStartTime?: string;
}

export interface KillOptions {
  silent?: boolean;
}

export interface PidRegistryEntry {
  pid: number;
  startTime: number;
  command: string;
  args: string[];
  titles?: string[];
  uniqueId?: string;
  pgid?: number;
  osStartTime?: string;
  role?: string;
  instanceId?: string;
}

export interface ReapResult {
  entry: PidRegistryEntry;
  outcome: 'killed' | 'gone' | 'foreign' | 'failed';
  error?: Error;
}

export class PidRegistry {
  private entries: PidRegistryEntry[];
  private writing: Promise<void> = Promise.resolve();

  constructor(private file: string) {
    this.entries = readRegistrySync(file);
  }

  public get all(): PidRegistryEntry[] {
    return [...this.entries];
  }

  public add(entry: PidRegistryEntry): PidRegistryEntry {
    this.entries.push(entry);
    this.persist();
    this.resolveIdentity(entry);
    return entry;
  }

  public remove(pid: number | undefined): void {
    if (!pid) {
      return;
    }

    const before = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.pid !== pid);
    if (this.entries.length !== before) {
      this.persist();
    }
  }

  public replace(entries: PidRegistryEntry[]): Promise<void> {
    this.entries = [...entries];
    return this.persist();
  }

  public flush(): Promise<void> {
    return this.writing;
  }

  private async resolveIdentity(entry: PidRegistryEntry): Promise<void> {
    const snapshot = (await readProcessSnapshots([entry.pid]).catch(() => undefined))?.get(entry.pid);
    if (!snapshot?.osStartTime || !this.entries.includes(entry)) {
      return;
    }

    entry.osStartTime = snapshot.osStartTime;
    await this.persist();
  }

  private persist(): Promise<void> {
    const content = JSON.stringify(this.entries);
    this.writing = this.writing.then(() => writeFileAtomic(this.file, content)).catch(() => {});
    return this.writing;
  }
}

export function readRegistrySync(file: string): PidRegistryEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'));
    return Array.isArray(parsed) ? parsed.filter((entry) => Number.isInteger(entry?.pid) && entry.pid > 0) : [];
  } catch {
    return [];
  }
}

export function isOwnProcess(entry: PidRegistryEntry, proc: ProcessSnapshot | undefined): boolean {
  if (!proc) {
    return false;
  }

  const titleMatch = Boolean(entry.titles?.some((title) => proc.name?.includes(title) || proc.cmd?.includes(title)));
  if (entry.osStartTime && proc.osStartTime) {
    return entry.osStartTime === proc.osStartTime && (matchesCommand(entry, proc) || titleMatch);
  }

  const idMatch = Boolean(entry.uniqueId && proc.cmd?.includes(entry.uniqueId));
  const argsMatch = (entry.args ?? []).every((arg) => proc.cmd?.includes(arg));

  return idMatch || titleMatch || (matchesCommand(entry, proc) && argsMatch);
}

export async function reapRegistry(entries: PidRegistryEntry[]): Promise<ReapResult[]> {
  const candidates = entries.filter((entry) => entry.pid !== process.pid);
  const alive = candidates.filter((entry) => isAlive(entry.pid));

  let snapshots = new Map<number, ProcessSnapshot>();
  if (alive.length > 0) {
    snapshots = await readProcessSnapshots(alive.map((entry) => entry.pid));
  }

  const leaderless = process.platform !== 'win32' && candidates.some((entry) => entry.pgid && !snapshots.has(entry.pid));
  const init = leaderless ? (await readProcessSnapshots([1])).get(1) : undefined;

  const results = await Promise.all(
    candidates.map(async (entry): Promise<ReapResult> => {
      const snapshot = snapshots.get(entry.pid);
      if (!snapshot) {
        return killOrphanedGroup(entry, init?.osStartTime);
      }
      if (!isOwnProcess(entry, snapshot)) {
        return { entry, outcome: 'foreign' };
      }

      try {
        await killTree(entry);
        return { entry, outcome: 'killed' };
      } catch (error) {
        return { entry, outcome: 'failed', error: error as Error };
      }
    }),
  );

  await waitForExit(results.filter(({ outcome }) => outcome === 'killed').map(({ entry }) => entry));
  return results;
}

export async function killTree(entry: Pick<PidRegistryEntry, 'pid' | 'pgid'>): Promise<void> {
  if (process.platform === 'win32') {
    return killProcess(entry.pid);
  }

  if (entry.pgid && entry.pgid > 1 && entry.pgid !== process.pid) {
    try {
      process.kill(-entry.pgid, 'SIGKILL');
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error;
      }
    }
  }

  return killProcess(entry.pid);
}

export async function killProcesses(pids: number[], options: KillOptions = {}): Promise<void> {
  const targets = [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  const errors: string[] = [];

  await Promise.all(
    targets.map(async (pid) => {
      try {
        if (process.platform === 'win32') {
          // taskkill only reports a missing process in the system language, so ask first
          process.kill(pid, 0);
          await exec('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true });
        } else {
          process.kill(pid, 'SIGKILL');
        }
      } catch (error) {
        errors.push(`Killing process ${pid} failed: ${failureReason(error)}`);
      }
    }),
  );

  if (errors.length > 0 && !options.silent) {
    throw new AggregateError(errors, 'Failed to kill processes');
  }
}

export async function killProcess(pid: number, options: KillOptions = {}): Promise<void> {
  return killProcesses([pid], options);
}

export async function writeFileAtomic(file: string, content: string): Promise<void> {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, content);
  try {
    await rename(temp, file);
  } catch {
    // windows refuses the rename while a reader holds the file open
    await writeFile(file, content);
    await unlink(temp).catch(() => {});
  }
}

export async function readProcessSnapshots(pids: number[]): Promise<Map<number, ProcessSnapshot>> {
  const targets = [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0);
  if (targets.length === 0) {
    return new Map();
  }

  if (process.platform === 'linux') {
    return readFromProc(targets);
  }
  if (process.platform === 'win32') {
    return readFromCim(targets);
  }

  return readFromPs(targets);
}

async function waitForExit(entries: PidRegistryEntry[]): Promise<void> {
  const until = Date.now() + EXIT_WAIT_MS;
  let pending = entries;
  while (pending.length > 0 && Date.now() < until) {
    await sleep(50);
    pending = pending.filter((entry) => isAlive(entry.pid) || (process.platform !== 'win32' && entry.pgid && isAlive(-entry.pgid)));
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function killOrphanedGroup(entry: PidRegistryEntry, initStartTime: string | undefined): ReapResult {
  // before this boot or this container's init the number can name any group
  if (!entry.pgid || entry.pgid <= 1 || entry.pgid === process.pid || !startedSince(entry.osStartTime, initStartTime)) {
    return { entry, outcome: 'gone' };
  }

  try {
    process.kill(-entry.pgid, 'SIGKILL');
    return { entry, outcome: 'killed' };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') {
      return { entry, outcome: 'gone' };
    }
    return code === 'EPERM' ? { entry, outcome: 'foreign' } : { entry, outcome: 'failed', error: error as Error };
  }
}

function startedSince(start: string | undefined, since: string | undefined): boolean {
  if (!start || !since) {
    return false;
  }

  // the /proc form is btime:ticks, ps gives lstart
  const proc = /^(\d+):(\d+)$/;
  const [a, b] = [proc.exec(start), proc.exec(since)];
  if (a && b) {
    // btime is rounded and can differ by a second between reads
    return Math.abs(Number(a[1]) - Number(b[1])) <= 1 && Number(a[2]) >= Number(b[2]);
  }

  const [at, bt] = [Date.parse(start), Date.parse(since)];
  return !Number.isNaN(at) && !Number.isNaN(bt) && at >= bt;
}

function matchesCommand(entry: PidRegistryEntry, proc: ProcessSnapshot): boolean {
  return Boolean(proc.name === entry.command || proc.cmd?.includes(entry.command));
}

function failureReason(error: unknown): string {
  if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
    return "Process doesn't exist";
  }

  const stderr = (error as { stderr?: string }).stderr?.trim();
  if (stderr) {
    return stderr.replace(/^ERROR:\s*/i, '');
  }

  return error instanceof Error ? error.message : String(error);
}

function snapshot(command: string, fallbackName: string, osStartTime?: string): ProcessSnapshot {
  const executable = command.split(' ')[0];
  return { name: executable ? basename(executable) : fallbackName, cmd: command, osStartTime };
}

async function readFromProc(pids: number[]): Promise<Map<number, ProcessSnapshot>> {
  const snapshots = new Map<number, ProcessSnapshot>();
  const bootTime = /^btime (\d+)$/m.exec(await readFile('/proc/stat', 'utf8').catch(() => ''))?.[1] ?? '';

  await Promise.all(
    pids.map(async (pid) => {
      const comm = (await readFile(`/proc/${pid}/comm`, 'utf8').catch(() => '')).trim();
      if (!comm) {
        return;
      }

      const raw = await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '');
      const cmd = raw.split('\0').filter(Boolean).join(' ').trim();
      // /proc/<pid>/exe is the real binary, comm is truncated to 15 characters
      const exe = await readlink(`/proc/${pid}/exe`).catch(() => '');
      const name = exe ? basename(exe.replace(/\s+\(deleted\)$/, '')) : comm;

      // field 22 is the start in ticks since boot, the comm field before it can hold spaces and parentheses
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8').catch(() => '');
      const ticks = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];

      snapshots.set(pid, { name, cmd: cmd || comm, osStartTime: ticks ? `${bootTime}:${ticks}` : undefined });
    }),
  );

  return snapshots;
}

async function readFromPs(pids: number[]): Promise<Map<number, ProcessSnapshot>> {
  const snapshots = new Map<number, ProcessSnapshot>();
  const { stdout } = await exec('ps', ['-ww', '-o', 'pid=,lstart=,args=', '-p', pids.join(',')], { env: { ...process.env, LC_ALL: 'C' } }).catch((error) => {
    // ps exits non-zero when none of the pids exist
    if ((error as { stdout?: string }).stdout !== undefined) {
      return error as { stdout: string };
    }
    throw error;
  });

  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\w{3} \w{3} [ \d]\d \d\d:\d\d:\d\d \d{4})\s+(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    snapshots.set(Number(match[1]), snapshot(match[3].trim(), '', match[2]));
  }

  return snapshots;
}

async function readFromCim(pids: number[]): Promise<Map<number, ProcessSnapshot>> {
  const filter = pids.map((pid) => `ProcessId=${pid}`).join(' or ');
  const select = "Select-Object ProcessId,Name,CommandLine,@{n='Created';e={$_.CreationDate.ToFileTimeUtc()}}";
  const { stdout } = await exec(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter "${filter}" | ${select} | ConvertTo-Json -Compress`],
    { windowsHide: true },
  );

  const snapshots = new Map<number, ProcessSnapshot>();
  const trimmed = stdout.trim();
  if (!trimmed) {
    return snapshots;
  }

  interface CimProcess {
    ProcessId: number;
    Name?: string;
    CommandLine?: string;
    Created?: number;
  }
  const parsed = JSON.parse(trimmed) as CimProcess | CimProcess[];
  for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
    snapshots.set(entry.ProcessId, { name: entry.Name ?? '', cmd: entry.CommandLine ?? '', osStartTime: entry.Created ? String(entry.Created) : undefined });
  }

  return snapshots;
}
