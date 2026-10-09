import { once } from 'node:events';
import { bench, describe } from 'vitest';

import { openLiveTap } from './fixtures/liveTap';

describe('live tap backlog over a socket', () => {
  for (const count of [1000, 50_000]) {
    const input = Array.from(
      { length: count },
      (_, i) => `{"_e":"test:row","_t":${i},"i":${i}}\n`
    ).join('');

    bench(`${count} events`, async () => {
      const live = await openLiveTap();
      try {
        // Enter live delivery before the burst, then pause until it is buffered.
        const first = live.iterator.next();
        const closed = once(live.socket, 'close');
        live.socket.end(input);
        await first;
        await closed;
        while (!(await live.iterator.next()).done) {}
      } finally {
        await live.close();
      }
    });
  }
});
