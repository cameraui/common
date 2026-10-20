export type LogLevel = 'log' | 'warn' | 'error' | 'debug' | 'trace' | 'success' | 'attention' | 'raw';

export type LogTargetType = 'camera' | 'plugin' | 'system';

export type LogSource = 'main' | 'child';

export interface LogEntry {
  timestamp: number; // unix ms
  level: LogLevel;
  prefix: string;
  suffix?: string;
  message: string;
  targetId?: string;
  targetType?: LogTargetType;
  pluginId?: string;
  source: LogSource;
  processId?: number;
}

export interface ChildLogMessage {
  type: 'log';
  entry: LogEntry;
}

export interface LoggerOptions {
  prefix?: string;
  suffix?: string;
  disablePrefix?: boolean;
  disableTimestamps?: boolean;
  debugEnabled?: boolean;
  traceEnabled?: boolean;
  targetId?: string;
  targetType?: LogTargetType;
  pluginId?: string;
}

export interface LogTransport {
  write(entry: LogEntry): void;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

export type LogEventCallback = (entry: LogEntry) => void;
