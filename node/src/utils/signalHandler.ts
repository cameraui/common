import { PromiseTimeout } from './utils.js';

import type { LoggerService } from '@camera.ui/sdk';

export interface SignalHandlerOptions {
  displayName: string;
  logger: LoggerService;
  timeoutDuration?: number;
  closeFunction: () => Promise<void>;
  onSIGUSR2?: () => void;
}

export class SignalHandler {
  private displayName: string;
  private isShuttingDown = false;
  private logger: LoggerService;
  private timeoutDuration: number;

  private onSIGUSR2?: () => void;
  private closeFunction: () => Promise<void>;

  constructor(options: SignalHandlerOptions) {
    this.displayName = options.displayName;
    this.logger = options.logger;
    this.timeoutDuration = options.timeoutDuration ?? 5000;

    this.onSIGUSR2 = options.onSIGUSR2;
    this.closeFunction = options.closeFunction;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    process.on('uncaughtException', (error) => this.gracefullyClose('uncaughtException', undefined, error));
    process.on('unhandledRejection', (reason, promise) => this.logError('unhandledRejection', reason, undefined, promise));
    process.on('SIGTERM', () => this.gracefullyClose('SIGTERM'));
    process.on('SIGINT', () => this.gracefullyClose('SIGINT'));
    process.on('SIGUSR2', () => this.gracefullyClose('SIGUSR2'));
  }

  private async gracefullyClose(signal: string, reason?: unknown, error?: NodeJS.ErrnoException | string, promise?: any): Promise<void> {
    if (this.onSIGUSR2 && signal === 'SIGUSR2') {
      this.onSIGUSR2();
    }

    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.log(this.displayName, `Received ${signal}. Stopping...`);

    this.logError(signal, reason, error, promise);

    try {
      await PromiseTimeout(this.closeFunction(), this.timeoutDuration, undefined, 'Graceful shutdown timed out');
    } catch (err) {
      this.logger.warn(this.displayName, `Failed to gracefully close: ${err.message}. Force quitting!`);
    } finally {
      process.exit(error ? 1 : 0);
    }
  }

  private logError(signal: string, reason?: unknown, error?: NodeJS.ErrnoException | string, promise?: any): void {
    if (error) {
      if (typeof error === 'string') {
        this.logger.error(this.displayName, `${signal}: ${error}`);
      } else {
        this.logger.error(this.displayName, `${signal}: ${error.message}`, error.stack);
      }
    } else if (reason) {
      if (reason instanceof Error) {
        this.logger.error(this.displayName, `${signal}: Unhandled promise rejection: ${reason.message}`, reason.stack);
      } else {
        const errorMessage = typeof reason === 'object' ? reason : String(reason as any);

        this.logger.error(this.displayName, `${signal}: Unhandled promise rejection:`, errorMessage);

        if (promise && typeof promise.stack === 'string') {
          this.logger.error(this.displayName, 'Promise stack trace:', promise.stack);
        }
      }
    }
  }
}
