import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { Subject } from 'rxjs';

import type { ChildProcessWithoutNullStreams } from 'child_process';

const noop = () => null;
const onGlobalProcessStopped = new Subject();

process.on('exit', () => onGlobalProcessStopped.next(null));

export interface BufferOptions {
  checkSize: (buffer: Buffer) => number;
  onData: (data: Buffer) => void;
}

export interface FfmpegProcessOptions {
  ffmpegPath: string;
  ffmpegArgs: (string | number)[];
  logger?: {
    error: (...args: any[]) => void;
    trace: (...args: any[]) => void;
  };
  logLabel?: string;
  exitCallback?: (code: number | null, signal: string | null) => unknown;
  stdoutCallback?: (data: any) => unknown;
  startedCallback?: () => unknown;
  bufferOptions?: BufferOptions;
}

export class FfmpegProcess {
  private ff: ChildProcessWithoutNullStreams;
  private processSubscription = onGlobalProcessStopped.subscribe(() => this.stop());
  private started = false;
  private stopped = false;
  private exited = false;

  private buffer: Buffer = Buffer.alloc(0);
  private bufferStream?: PassThrough;

  get pid(): number | undefined {
    return this.ff.pid;
  }

  constructor(public readonly options: FfmpegProcessOptions) {
    const { logger, logLabel } = options;
    const logError = logger?.error ?? noop;
    const logTrace = logger?.trace ?? noop;
    const logPrefix = logLabel ?? '';

    const ffmpegArgs = options.ffmpegArgs.map((x) => x.toString());
    logTrace(logPrefix + 'Starting FFmpeg process with args:', options.ffmpegPath, ffmpegArgs.join(' '));

    this.ff = spawn(options.ffmpegPath, ffmpegArgs);

    if (options.bufferOptions) {
      this.bufferStream = new PassThrough();
      this.bufferStream.on('data', (chunk: Buffer) => {
        this.handleBufferedData(chunk);
      });

      this.ff.stdout.on('data', (data: any) => {
        this.bufferStream?.write(data);
      });
    } else if (options.stdoutCallback) {
      const { stdoutCallback } = options;
      this.ff.stdout.on('data', (data: any) => {
        stdoutCallback(data);
      });
    }

    this.ff.stderr.on('data', (data: any) => {
      if (!this.started) {
        this.started = true;
        options.startedCallback?.();
      }

      data
        .toString()
        .split('\n')
        .forEach((data: string) => {
          logTrace(logPrefix, data.trim());
        });
    });

    this.ff.stdin.on('error', (error) => {
      if (!error.message.includes('EPIPE')) {
        logError(logPrefix + error.message);
      }
    });

    this.ff.on('error', (error) => {
      logError(logPrefix + error.message);
    });

    this.ff.on('exit', (code, signal) => {
      this.exited = true;
      this.options.exitCallback?.(code, signal);

      if (this.buffer.length > 0 && this.options.bufferOptions) {
        this.options.bufferOptions.onData(this.buffer);
        this.buffer = Buffer.alloc(0);
      }

      if (!code || code === 255) {
        logTrace(logPrefix + 'stopped gracefully');
      } else {
        logError(logPrefix + `exited with code ${code} and signal ${signal}`);
      }
      this.stop();
    });
  }

  private handleBufferedData(chunk: Buffer): void {
    if (!this.options.bufferOptions || this.stopped) {
      return;
    }

    this.buffer = Buffer.concat([this.buffer, chunk]);

    let size: number;
    while ((size = this.options.bufferOptions.checkSize(this.buffer)) > 0) {
      const data = this.buffer.subarray(0, size);
      this.options.bufferOptions.onData(data);
      this.buffer = this.buffer.subarray(size);
    }
  }

  public stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.processSubscription.unsubscribe();

    this.bufferStream?.destroy();
    this.buffer = Buffer.alloc(0);

    this.ff.stderr.pause();
    this.ff.stdout.pause();

    if (!this.exited) {
      this.ff.kill();
    }
  }

  public writeStdin(input: string): void {
    if (this.stopped) return;
    this.ff.stdin.write(input);
    this.ff.stdin.end();
  }

  public writeStdinBuffer(input: Buffer): void {
    if (this.stopped) return;
    this.ff.stdin.write(input);
  }
}
