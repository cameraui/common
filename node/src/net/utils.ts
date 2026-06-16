import { createConnection } from 'node:net';

import type { Readable } from 'node:stream';

export class StreamEndError extends Error {
  constructor() {
    super('stream ended');
  }
}

export async function readLength(readable: Readable, length: number): Promise<Buffer> {
  if (readable.readableEnded || readable.destroyed) throw new StreamEndError();

  if (!length) {
    return Buffer.allocUnsafe(0);
  }

  {
    const ret = readable.read(length);
    if (ret) {
      return ret;
    }
  }

  return new Promise((resolve, reject) => {
    const r = () => {
      const ret = readable.read(length);
      if (ret) {
        cleanup();
        resolve(ret);
        return;
      }

      if (readable.readableEnded || readable.destroyed) reject(new Error('stream ended during read'));
    };

    const e = () => {
      cleanup();
      reject(new StreamEndError());
    };

    const cleanup = () => {
      readable.removeListener('readable', r);
      readable.removeListener('end', e);
    };

    readable.on('readable', r);
    readable.on('end', e);
  });
}

export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createConnection({ port: port, host: 'localhost' });

    const cleanup = () => {
      try {
        tester.removeAllListeners();
        tester.destroy();
        tester.unref();
      } catch {
        //
      }
    };

    const onConnect = () => {
      cleanup();
      resolve(true);
    };

    const onError = (err: NodeJS.ErrnoException) => {
      cleanup();
      if (err.code === 'ECONNREFUSED') {
        resolve(false);
      } else {
        resolve(true);
      }
    };

    tester.on('connect', onConnect);
    tester.on('error', onError);
  });
}
