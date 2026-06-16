import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';

export interface MonitoringOptions {
  host: string;
  port: number;
  interval?: number;
  timeout?: number;
}

export interface MonitoringResult {
  host: string;
  port: number;
  alive: boolean;
  error?: string;
}

export declare interface Monitor {
  on(event: 'status', listener: (info: MonitoringResult) => void): this;
}

export class Monitor extends EventEmitter {
  private host: string;
  private port: number;
  private interval: number;
  private timeout: number;
  private isAlive = true;
  private intervalId?: NodeJS.Timeout;

  constructor(options: MonitoringOptions) {
    super();
    this.host = options.host;
    this.port = options.port;
    this.interval = options.interval ?? 5000;
    this.timeout = options.timeout ?? 3000;
  }

  public async start(): Promise<void> {
    await this.performCheck();
    this.intervalId = setInterval(() => {
      this.performCheck();
    }, this.interval);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  public getStatus(): boolean {
    return this.isAlive;
  }

  public getDestination(): { host: string; port: number } {
    return {
      host: this.host,
      port: this.port,
    };
  }

  private async check(): Promise<MonitoringResult> {
    return new Promise((resolve) => {
      const socket = new Socket();
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve({
          host: this.host,
          port: this.port,
          alive: false,
        });
      }, this.timeout);

      socket.on('connect', () => {
        clearTimeout(timer);
        cleanup();
        resolve({
          host: this.host,
          port: this.port,
          alive: true,
        });
      });

      socket.on('error', () => {
        clearTimeout(timer);
        cleanup();
        resolve({
          host: this.host,
          port: this.port,
          alive: false,
        });
      });

      socket.connect(this.port, this.host);
    });
  }

  private async performCheck(): Promise<void> {
    const result = await this.check();
    const wasAlive = this.isAlive;

    // Status hat sich geändert
    if (result.alive !== wasAlive) {
      this.isAlive = result.alive;
      this.emit('status', result);
    }
  }
}
