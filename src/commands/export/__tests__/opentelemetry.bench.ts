import { bench, describe } from 'vitest';

import { convertToOpenTelemetry } from '../opentelemetry';

const instants = Array.from({ length: 1000 }, (_, index) => ({
  _e: 'build:progress',
  _t: 1_700_000_000_000 + index * 0.125,
  progress: index,
}));
const spans = instants.map(event => ({
  ...event,
  _e: 'build:done',
  _d: 0.25,
}));
const arrays = instants.map(event => ({
  ...event,
  samples: Array.from({ length: 32 }, (_, index) => index / 2),
  tags: ['build', 'cached', null],
}));

describe('OpenTelemetry export (1000 events)', () => {
  bench('instants', async () => {
    await convertToOpenTelemetry(instants);
  });

  bench('spans', async () => {
    await convertToOpenTelemetry(spans);
  });

  bench('array payloads', async () => {
    await convertToOpenTelemetry(arrays);
  });
});
