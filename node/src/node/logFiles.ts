import { open, rename, rm, stat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const ROTATE_ATTEMPTS = 3;
const ROTATE_RETRY_MS = 100;

export const MAIN_LOG_SIZE = 5 * 1024 * 1024;

export interface LogRotation {
  rotated: boolean;
  error?: string;
}

export async function rotateLogFile(path: string, maxSize: number): Promise<LogRotation> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rm(`${path}.1`, { force: true });
      await rename(path, `${path}.1`);
      return { rotated: true };
    } catch (error: any) {
      if (error.code === 'ENOENT') return { rotated: true };
      if (attempt === ROTATE_ATTEMPTS) {
        await cutLogFile(path, Math.floor(maxSize / 2));
        return { rotated: false, error: error.code ?? error.message };
      }
      await delay(ROTATE_RETRY_MS);
    }
  }
}

export async function rotateFullLogFile(path: string, maxSize: number): Promise<LogRotation | undefined> {
  const size = await stat(path).then(
    (info) => info.size,
    () => 0,
  );
  return size >= maxSize ? rotateLogFile(path, maxSize) : undefined;
}

export async function cutLogFile(path: string, keep: number): Promise<void> {
  const handle = await open(path, 'r+').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!handle) return;

  try {
    const { size } = await handle.stat();
    if (size <= keep) return;

    const buffer = Buffer.alloc(keep);
    const { bytesRead } = await handle.read(buffer, 0, keep, size - keep);
    const tail = buffer.subarray(buffer.indexOf(0x0a) + 1, bytesRead);

    // written before the truncate, a crash in between never leaves an empty file
    await handle.write(tail, 0, tail.length, 0);
    await handle.truncate(tail.length);
  } finally {
    await handle.close();
  }
}
