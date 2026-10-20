import { EventEmitter } from 'node:events';
import { inspect, styleText } from 'node:util';

import type { ChildLogMessage, LogEntry, LogEventCallback, LoggerOptions, LogLevel, LogSource, LogTargetType } from './types.js';

export type { ChildLogMessage, LogEntry, LogEventCallback, LoggerOptions, LogLevel, LogSource, LogTargetType, LogTransport } from './types.js';

type Color = 'red' | 'yellow' | 'green' | 'magenta' | 'blue' | 'cyan' | 'gray' | 'bgRed' | 'bgYellow' | 'bgGreen' | 'bgMagenta' | 'bgGray';

const ESCAPE = String.fromCharCode(27);

function paint(color: Color, text: string): string {
  const [open, close] = inspect.colors[color];
  // plugin and ffmpeg output carry their own codes, their resets fall back to the outer color
  const nested = text.replaceAll(`${ESCAPE}[${close}m`, `${ESCAPE}[${open}m`);

  // stdout is no TTY in the background process, styleText would drop the colors
  return styleText(color, nested, { validateStream: false });
}

export class Logger extends EventEmitter {
  private static readonly LEVEL_PREFIXES: Record<Exclude<LogLevel, 'raw'>, string> = {
    error: paint('bgRed', ' ERROR '),
    warn: paint('bgYellow', ' WARN '),
    success: paint('bgGreen', ' SUCCESS '),
    attention: paint('bgMagenta', ' ATTENTION '),
    trace: paint('bgGray', ' TRACE '),
    debug: '',
    log: '',
  };

  public prefix: string;
  public suffix?: string;
  public disablePrefix = false;
  public disableTimestamps = false;
  public debugEnabled = false;
  public traceEnabled = false;

  public targetId?: string;
  public targetType?: LogTargetType;
  public pluginId?: string;

  private isChildProcess = false;
  private source: LogSource = 'main';

  constructor(options?: LoggerOptions) {
    super();

    this.prefix = options?.prefix ?? 'camera.ui';
    this.suffix = options?.suffix;
    this.disablePrefix = options?.disablePrefix ?? false;
    this.disableTimestamps = options?.disableTimestamps ?? false;
    this.debugEnabled = options?.debugEnabled ?? false;
    this.traceEnabled = options?.traceEnabled ?? false;
    this.targetId = options?.targetId;
    this.targetType = options?.targetType;
    this.pluginId = options?.pluginId;
  }

  public setChildProcessMode(enabled: boolean): void {
    this.isChildProcess = enabled;
    this.source = enabled ? 'child' : 'main';
  }

  public createLogger(options?: LoggerOptions): Logger {
    const logger = new Logger({
      prefix: options?.prefix ?? this.prefix,
      suffix: options?.suffix ?? this.suffix,
      disablePrefix: options?.disablePrefix ?? this.disablePrefix,
      disableTimestamps: options?.disableTimestamps ?? this.disableTimestamps,
      debugEnabled: options?.debugEnabled ?? this.debugEnabled,
      traceEnabled: options?.traceEnabled ?? this.traceEnabled,
      targetId: options?.targetId ?? this.targetId,
      targetType: options?.targetType ?? this.targetType,
      pluginId: options?.pluginId ?? this.pluginId,
    });

    logger.isChildProcess = this.isChildProcess;
    logger.source = this.source;

    logger.on('log', (entry: LogEntry) => {
      this.emit('log', entry);
    });

    return logger;
  }

  public onLog(callback: LogEventCallback): void {
    this.on('log', callback);
  }

  public offLog(callback: LogEventCallback): void {
    this.off('log', callback);
  }

  public log(...args: any[]): void {
    this.writeLog('log', args);
  }

  public error(...args: any[]): void {
    this.writeLog('error', args);
  }

  public warn(...args: any[]): void {
    this.writeLog('warn', args);
  }

  public success(...args: any[]): void {
    this.writeLog('success', args);
  }

  public attention(...args: any[]): void {
    this.writeLog('attention', args);
  }

  public debug(...args: any[]): void {
    if (this.debugEnabled) {
      this.writeLog('debug', args);
    }
  }

  public trace(...args: any[]): void {
    if (this.traceEnabled) {
      this.writeLog('trace', args);
    }
  }

  public raw(...args: any[]): void {
    const message = args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ');

    if (this.isChildProcess) {
      const entry = this.createEntry('raw', args);
      this.writeToStdout(entry);
    } else {
      console.log(message);

      const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'raw',
        prefix: '',
        message,
        targetId: this.targetId,
        targetType: this.targetType,
        source: this.source,
        processId: process.pid,
      };
      this.emit('log', entry);
    }
  }

  private writeLog(level: LogLevel, args: any[]): void {
    const entry = this.createEntry(level, args);

    if (this.isChildProcess) {
      this.writeToStdout(entry);
    } else {
      this.writeToConsole(entry);
      this.emit('log', entry);
    }
  }

  private createEntry(level: LogLevel, args: any[]): LogEntry {
    const formattedArgs = this.formatArgs(args);
    const message = formattedArgs.join(' ');

    return {
      timestamp: Date.now(),
      level,
      prefix: this.prefix,
      suffix: this.suffix,
      message,
      targetId: this.targetId,
      targetType: this.targetType,
      pluginId: this.pluginId,
      source: this.source,
      processId: process.pid,
    };
  }

  private writeToStdout(entry: LogEntry): void {
    const message: ChildLogMessage = { type: 'log', entry };
    process.stdout.write(JSON.stringify(message) + '\n');
  }

  private writeToConsole(entry: LogEntry): void {
    const formatted = this.formatForConsole(entry);
    console.log(...formatted);
  }

  public formatForConsole(entry: LogEntry): string[] {
    if (entry.level === 'raw') {
      return [entry.message];
    }

    const parts: string[] = [];

    if (!this.disableTimestamps) {
      parts.push(`[${this.formatTimestamp(entry.timestamp)}]`);
    }

    if (!this.disablePrefix && entry.prefix) {
      parts.push(paint('blue', `[${entry.prefix}]`));
    }

    if (entry.suffix) {
      parts.push(paint('cyan', `[${entry.suffix}]`));
    }

    const levelPrefix = Logger.LEVEL_PREFIXES[entry.level];
    if (levelPrefix) {
      parts.push(levelPrefix);
    }

    const coloredMessage = this.colorizeMessage(entry.level, entry.message);
    parts.push(coloredMessage);

    return parts;
  }

  private colorizeMessage(level: LogLevel, message: string): string {
    switch (level) {
      case 'debug':
      case 'trace':
        return paint('gray', message);
      case 'warn':
        return paint('yellow', message);
      case 'error':
        return paint('red', message);
      case 'success':
        return paint('green', message);
      case 'attention':
        return paint('magenta', message);
      default:
        return message;
    }
  }

  private formatArgs(args: any[]): string[] {
    const inspectOptions = {
      depth: 2,
      colors: !this.isChildProcess,
      compact: 3,
      breakLength: 80,
      maxArrayLength: 100,
      maxStringLength: 100,
      numericSeparator: false,
    };

    return args.map((arg) => {
      if (arg instanceof Error) {
        let message = arg.stack ?? arg.message;
        if ('cause' in arg && arg.cause) {
          const formattedCause = typeof arg.cause === 'object' ? inspect(arg.cause, { ...inspectOptions, colors: false }) : String(arg.cause as any);
          message += `\n[cause]: ${formattedCause}`;
        }
        return message;
      } else if (arg instanceof Promise) {
        return inspect(arg, { ...inspectOptions, depth: 0 });
      } else if (Buffer.isBuffer(arg) || arg instanceof Uint8Array) {
        return inspect(arg, { ...inspectOptions, compact: 2, maxArrayLength: 100 });
      } else if (typeof arg === 'object' && arg !== null) {
        return inspect(arg, inspectOptions);
      } else {
        return String(arg);
      }
    });
  }

  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${day}.${month}.${year}, ${hours}:${minutes}:${seconds}`;
  }

  public static formatWithColors(entry: LogEntry): string {
    if (entry.level === 'raw') {
      return entry.message;
    }

    const parts: string[] = [];

    const date = new Date(entry.timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    parts.push(`[${day}.${month}.${year}, ${hours}:${minutes}:${seconds}]`);

    if (entry.prefix) {
      parts.push(paint('blue', `[${entry.prefix}]`));
    }

    if (entry.suffix) {
      parts.push(paint('cyan', `[${entry.suffix}]`));
    }

    const levelPrefix = Logger.LEVEL_PREFIXES[entry.level];
    if (levelPrefix) {
      parts.push(levelPrefix);
    }

    let coloredMessage: string;
    switch (entry.level) {
      case 'debug':
      case 'trace':
        coloredMessage = paint('gray', entry.message);
        break;
      case 'warn':
        coloredMessage = paint('yellow', entry.message);
        break;
      case 'error':
        coloredMessage = paint('red', entry.message);
        break;
      case 'success':
        coloredMessage = paint('green', entry.message);
        break;
      case 'attention':
        coloredMessage = paint('magenta', entry.message);
        break;
      default:
        coloredMessage = entry.message;
    }
    parts.push(coloredMessage);

    return parts.join(' ');
  }

  public static formatAsText(entry: LogEntry): string {
    if (entry.level === 'raw') {
      return entry.message.replace(/\x1b\[[0-9;]*m/g, '');
    }

    const parts: string[] = [];

    const date = new Date(entry.timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    parts.push(`[${day}.${month}.${year}, ${hours}:${minutes}:${seconds}]`);

    if (entry.prefix) {
      parts.push(`[${entry.prefix}]`);
    }

    if (entry.suffix) {
      parts.push(`[${entry.suffix}]`);
    }

    const levelPrefixes: Record<LogLevel, string> = {
      error: ' ERROR ',
      warn: ' WARN ',
      success: ' SUCCESS ',
      attention: ' ATTENTION ',
      trace: ' TRACE ',
      debug: '',
      log: '',
      raw: '',
    };
    const levelPrefix = levelPrefixes[entry.level];
    if (levelPrefix) {
      parts.push(levelPrefix);
    }

    const cleanMessage = entry.message.replace(/\x1b\[[0-9;]*m/g, '');
    parts.push(cleanMessage);

    return parts.join(' ');
  }

  public static parseChildLog(line: string): LogEntry | null {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'log' && parsed.entry) {
        return parsed.entry as LogEntry;
      }
    } catch {
      // not a log line
    }
    return null;
  }
}
