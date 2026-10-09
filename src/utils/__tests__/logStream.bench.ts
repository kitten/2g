import { bench, describe } from 'vitest';

import { LogStream } from '../logStream';

const lines = '{"_e":"test:line","_t":1000,"text":"漢😀"}\n'.repeat(1000);
const buffer = Buffer.from(lines);
const asciiBuffer = Buffer.from(
  '{"_e":"build:progress","_t":1000,"file":"src/components/Button.tsx","done":42}\n'.repeat(
    1000
  )
);

describe('log stream batching (20000 lines)', () => {
  for (const [name, input, partial] of [
    ['complete chunks', lines, false],
    ['chunks with partial tails', lines.slice(0, -1), true],
    ['Buffer chunks', buffer, false],
    ['Uint8Array chunks', new Uint8Array(buffer), false],
    ['ASCII Buffer chunks', asciiBuffer, false],
    ['ASCII Uint8Array chunks', new Uint8Array(asciiBuffer), false],
  ] as const) {
    const expectedBytes =
      (typeof input === 'string'
        ? Buffer.byteLength(input)
        : input.byteLength) + (partial ? 1 : 0);
    bench(name, async () => {
      let bytes = 0;
      const stream = new LogStream(onOpened => {
        onOpened(null, null, (data, done) => {
          bytes += data.length;
          setImmediate(done);
        });
      });
      for (let i = 0; i < 20; i++) {
        stream.write(input);
        if (partial) stream.write('\n');
      }
      await new Promise<void>(resolve => stream.end(resolve));
      if (bytes !== expectedBytes * 20) throw new Error('Lost log data');
    });
  }
});
