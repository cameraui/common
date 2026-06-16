/**
 * Log levels supported by the logging system
 */
export type LogLevel = 'log' | 'warn' | 'error' | 'debug' | 'trace' | 'success' | 'attention' | 'raw';

/**
 * Target type for routing logs to specific destinations
 */
export type LogTargetType = 'camera' | 'plugin' | 'system';

/**
 * Source of the log entry
 */
export type LogSource = 'main' | 'child';

/**
 * Structured log entry that flows through the logging system
 */
export interface LogEntry {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Log level */
  level: LogLevel;
  /** Primary prefix (e.g., component name) */
  prefix: string;
  /** Optional secondary prefix (e.g., camera name) */
  suffix?: string;
  /** The formatted log message */
  message: string;
  /** Target ID for routing (camera ID, plugin ID) */
  targetId?: string;
  /** Target type for routing */
  targetType?: LogTargetType;
  /** Plugin ID for routing camera logs to plugin log files */
  pluginId?: string;
  /** Whether this log came from main process or child */
  source: LogSource;
  /** Process ID that generated the log */
  processId?: number;
}

/**
 * Message format for child process log communication
 */
export interface ChildLogMessage {
  type: 'log';
  entry: LogEntry;
}

/**
 * Options for creating a logger instance
 */
export interface LoggerOptions {
  /** Primary prefix shown in logs */
  prefix?: string;
  /** Secondary prefix/suffix shown in logs */
  suffix?: string;
  /** Disable the prefix in output */
  disablePrefix?: boolean;
  /** Disable timestamps in output */
  disableTimestamps?: boolean;
  /** Enable debug level logging */
  debugEnabled?: boolean;
  /** Enable trace level logging */
  traceEnabled?: boolean;
  /** Target ID for log routing (camera ID, plugin ID) */
  targetId?: string;
  /** Target type for log routing */
  targetType?: LogTargetType;
  /** Plugin ID for routing camera logs to plugin log files */
  pluginId?: string;
}

/**
 * Transport interface for log destinations
 */
export interface LogTransport {
  /** Write a log entry to this transport */
  write(entry: LogEntry): void;
  /** Flush any buffered entries */
  flush?(): Promise<void>;
  /** Close the transport and release resources */
  close?(): Promise<void>;
}

/**
 * Callback type for log event listeners
 */
export type LogEventCallback = (entry: LogEntry) => void;
