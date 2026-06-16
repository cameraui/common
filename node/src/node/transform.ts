import { Transform } from 'node:stream';

import type { TransformOptions } from 'node:stream';

export class ChunkParser extends Transform {
  private buffer = Buffer.alloc(0);
  private readonly chunkSize: number;

  constructor(chunkSize: number, opts?: TransformOptions) {
    super(opts);
    this.chunkSize = chunkSize;
  }

  _transform(chunk: Buffer, _encoding: string, callback: Function) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= this.chunkSize) {
      const data = this.buffer.subarray(0, this.chunkSize);
      this.buffer = this.buffer.subarray(this.chunkSize);
      this.push(data);
    }

    callback();
  }
}
