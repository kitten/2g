import { describe, expect, it } from 'vitest';

import {
  getEventTimestamp,
  serializeEvent,
  writeCompleteEvent,
  writeEvent,
} from '../serializeEvent';

describe('serializeEvent', () => {
  it('serializes instant events and span events as JSONL', () => {
    const instant = JSON.parse(
      serializeEvent('metro', 'server_log', { level: 'warn' })
    );
    expect(instant).toMatchObject({ _e: 'metro:server_log', level: 'warn' });
    expect(typeof instant._t).toBe('number');

    const lines: string[] = [];
    writeCompleteEvent(
      {
        writable: true,
        _writeln(line) {
          lines.push(line);
          return true;
        },
        end() {
          return this;
        },
        destroy() {},
      },
      'metro',
      'bundling:done',
      { id: '1', platform: 'ios' },
      { id: '2', total: 42 },
      12.5,
      { _w: 'w1' }
    );

    expect(JSON.parse(lines[0])).toMatchObject({
      _e: 'metro:bundling:done',
      _d: 12.5,
      _w: 'w1',
      id: '2',
      platform: 'ios',
      total: 42,
    });
  });

  it('serializes the _l level only for leveled events', () => {
    const debugInstant = JSON.parse(
      serializeEvent('metro', 'probe', { hit: true }, undefined, undefined, 1)
    );
    expect(debugInstant).toMatchObject({ _e: 'metro:probe', _l: 1, hit: true });

    const debugWorkerSpan = JSON.parse(
      serializeEvent('metro', 'probe:done', undefined, { _w: 'w1' }, 12.5, 1)
    );
    expect(debugWorkerSpan).toMatchObject({ _d: 12.5, _l: 1, _w: 'w1' });

    for (const level of [undefined, 0]) {
      const normal = JSON.parse(
        serializeEvent('metro', 'tick', undefined, undefined, undefined, level)
      );
      expect(Object.keys(normal)).toEqual(['_e', '_t']);
    }
  });

  it('uses epoch milliseconds for event timestamps', () => {
    const before = Date.now();
    const timestamp = getEventTimestamp();
    const after = Date.now();

    expect(timestamp).toBeGreaterThanOrEqual(before - 5);
    expect(timestamp).toBeLessThanOrEqual(after + 5);
  });

  it('drops events with unserializable payloads instead of throwing', () => {
    const lines: string[] = [];
    const sink = {
      writable: true,
      _writeln(line: string) {
        lines.push(line);
        return true;
      },
      end() {
        return this;
      },
      destroy() {},
    };
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => writeEvent(sink, 'metro', 'bad', circular)).not.toThrow();
    expect(() =>
      writeCompleteEvent(sink, 'metro', 'bad:done', circular, undefined, 1)
    ).not.toThrow();
    expect(lines).toHaveLength(0);
  });
});
