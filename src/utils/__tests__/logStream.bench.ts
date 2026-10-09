import { bench, describe } from 'vitest';

import { LogStream } from '../logStream';

const lines = '{"_e":"test:line","_t":1000,"text":"漢😀"}\n'.repeat(1000);

describe('log stream batching (20000 lines)', () => {
  for (const partial of [false, true]) {
    bench(
      partial ? 'chunks with partial tails' : 'complete chunks',
      async () => {
        let bytes = 0;
        const stream = new LogStream(onOpened => {
          onOpened(null, null, (data, done) => {
            bytes += data.length;
            setImmediate(done);
          });
        });
        for (let i = 0; i < 20; i++) {
          stream.write(partial ? lines.slice(0, -1) : lines);
          if (partial) stream.write('\n');
        }
        await new Promise<void>(resolve => stream.end(resolve));
        if (bytes !== Buffer.byteLength(lines) * 20)
          throw new Error('Lost log data');
      }
    );
  }
});
