import { bench, describe } from 'vitest';

import { events } from '../events';
import type { EventSink } from '../utils/logStream';
import { writeEvent } from '../utils/serializeEvent';

const payload = {
  id: 'bundle-ios',
  platform: 'ios',
  entry: 'App.tsx',
  total: 2483,
  cached: false,
};

const event = events('metro') as unknown as (
  event: string,
  data: Record<string, unknown>
) => void;
const sink: EventSink = {
  writable: true,
  _writeln() {
    return true;
  },
  end() {
    return this;
  },
  destroy() {},
};

describe('event api overhead', () => {
  bench('event logger disabled call', () => {
    event('bundling:progress', payload);
  });

  bench('event logger enabled serialization to sink', () => {
    writeEvent(sink, 'metro', 'bundling:progress', payload);
  });
});
