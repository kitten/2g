import type { ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { bench, describe } from 'vitest';

import { captureEvents } from '../capture';

describe('buffered event capture', () => {
  for (const count of [1000, 50_000]) {
    const input = Array.from(
      { length: count },
      (_, i) => `{"_e":"bulk:row","_t":${i},"i":${i}}\n`
    ).join('');

    bench(`${count} events`, async () => {
      const stream = new PassThrough();
      const capture = captureEvents();
      capture.spawnOptions({ env: {} });
      capture.attach({
        stdio: [null, null, null, stream],
      } as unknown as ChildProcess);
      stream.end(input);
      await capture.collect();
    });
  }
});
