export const SUPERVISOR_IPC_ENV = 'CAMERAUI_SUPERVISOR_IPC';
export const SUPERVISOR_IPC_LEVEL = 2;

// older supervisors kill 8 s after SIGTERM, so a stop without SHUTDOWN has to fit in there
export const LEGACY_SUPERVISOR_BUDGET_MS = 6000;
export const SHUTDOWN_DEADLINE_MS = 20_000;
export const REAP_GRACE_MS = 8000;

export const UPDATE_STATE_FILE = '.update-state.json';

export type ShutdownReason = 'stop' | 'restart' | 'update' | 'reset' | 'unknown';

export type ServerRole = 'master' | 'worker';

export interface SupervisorShutdownMessage {
  type: 'SHUTDOWN';
  reason: ShutdownReason;
  deadlineMs: number;
}

export interface SupervisorRolledBackMessage {
  type: 'ROLLED_BACK';
  from: string;
  to: string;
  reason: string;
}

export interface SupervisorSuspendMessage {
  type: 'SUSPEND' | 'RESUME';
}

export interface ServerStartedMessage {
  type: 'STARTED';
  port?: number;
  ipc?: number;
  role?: ServerRole;
  bootId?: string;
}

export interface ServerHealthyMessage {
  type: 'HEALTHY';
  version: string;
}

export interface WorkerStatusMessage {
  type: 'WORKER_STATUS';
  state: string;
  master?: string;
  reason?: string;
  workloads?: number;
}

export interface UpdateState {
  target: string;
  from?: string;
  result: 'applied' | 'swap-failed' | 'rolled-back';
  reason?: string;
  at: number;
}

export function supervisorSpeaksShutdown(started: ServerStartedMessage | undefined): boolean {
  return (started?.ipc ?? 0) >= SUPERVISOR_IPC_LEVEL;
}
