import { bench, describe } from 'vitest';

import { convertToChromeTrace } from '../chromeTrace';

const instants = Array.from({ length: 10_000 }, (_, index) => ({
  _e: 'build:progress',
  _t: 1_700_000_000_000 + index,
}));
const spans = instants.map(event => ({ ...event, _e: 'build:done', _d: 10 }));
const workers = spans.map((event, index) => ({
  ...event,
  _w: `worker:${index % 100}`,
}));

describe('Chrome trace export (10000 events)', () => {
  bench('instants', async () => {
    await convertToChromeTrace(instants);
  });

  bench('overlapping spans', async () => {
    await convertToChromeTrace(spans);
  });

  bench('worker spans', async () => {
    await convertToChromeTrace(workers);
  });
});
