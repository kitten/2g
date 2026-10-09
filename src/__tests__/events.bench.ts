import { afterAll, bench, describe, expect } from 'vitest';

import { events } from '../events';
import type { EventLogger } from '../types';
import type { EventSink } from '../utils/logStream';
import { writeCompleteEvent, writeEvent } from '../utils/serializeEvent';

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
  let loggers: EventLogger<'metro'>[] = [];
  afterAll(() => {
    expect(loggers.every(logger => logger.category === 'metro')).toBe(true);
  });

  bench('create 1000 event loggers', () => {
    loggers = Array.from({ length: 1000 }, () => events('metro'));
  });

  bench('event logger disabled call', () => {
    event('bundling:progress', payload);
  });

  bench('event logger enabled serialization to sink', () => {
    writeEvent(sink, 'metro', 'bundling:progress', payload);
  });

  bench('completed span serialization to sink', () => {
    writeCompleteEvent(sink, 'metro', 'bundling:done', payload, 42.25);
  });

  bench('completed debug worker span serialization to sink', () => {
    writeCompleteEvent(
      sink,
      'metro',
      'bundling:done',
      payload,
      42.25,
      { _w: 'worker:1' },
      1
    );
  });
});
