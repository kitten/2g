import { describe, expect, it, vi } from 'vitest';

import { convertToOpenTelemetry } from '../opentelemetry';

describe('opentelemetry', () => {
  it('preserves rounded nanoseconds for fractional Unix timestamps', async () => {
    const output = await convertToOpenTelemetry([
      { _e: 'build:point', _t: 1_700_000_000_000.625 },
      { _e: 'build:done', _t: 1_700_000_000_000.375, _d: 0.25 },
    ]);
    const [parent, child] = output.resourceSpans[0].scopeSpans[0].spans;
    expect(parent.startTimeUnixNano).toBe('1700000000000124928');
    expect(parent.endTimeUnixNano).toBe('1700000000000624896');
    expect(child.startTimeUnixNano).toBe(parent.startTimeUnixNano);
    expect(child.endTimeUnixNano).toBe('1700000000000375040');
    expect(parent.events?.[0].timeUnixNano).toBe(parent.endTimeUnixNano);
    expect(() => JSON.stringify(output)).not.toThrow();
  });

  it('rounds sub-nanosecond and negative timestamps', async () => {
    const output = await convertToOpenTelemetry([
      { _e: 'build:point', _t: 0.0000005 },
      { _e: 'build:done', _t: -0.0000005, _d: 0.000001 },
    ]);
    const [parent, child] = output.resourceSpans[0].scopeSpans[0].spans;
    expect(parent.startTimeUnixNano).toBe('-1');
    expect(parent.endTimeUnixNano).toBe('1');
    expect(child.startTimeUnixNano).toBe('-1');
    expect(child.endTimeUnixNano).toBe('0');
    expect(parent.events?.[0].timeUnixNano).toBe('1');
  });

  it('uses the current time for an empty export', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1234);
    try {
      const output = await convertToOpenTelemetry([]);
      expect(output.resourceSpans[0].scopeSpans[0].spans[0]).toMatchObject({
        startTimeUnixNano: '1234000000',
        endTimeUnixNano: '1234000000',
      });
    } finally {
      now.mockRestore();
    }
  });

  it('does not replace supplied version with empty child metadata', async () => {
    const output = await convertToOpenTelemetry([
      {
        _e: 'root:init',
        _t: 950,
        _w: 'worker_thread:1',
      },
      { _e: 'root:init', _t: 900, version: '1.0.0' },
      {
        _e: 'root:init',
        _t: 975,
        _w: 'event_log_child:2',
      },
    ]);
    const resource = output.resourceSpans[0];
    expect(resource.resource.attributes).toContainEqual({
      key: 'service.version',
      value: { stringValue: '1.0.0' },
    });
    expect(resource.resource.attributes).toContainEqual({
      key: 'service.name',
      value: { stringValue: '2g (v1.0.0)' },
    });
    expect(resource.scopeSpans[0].spans).toEqual([
      expect.objectContaining({
        name: '2g (v1.0.0)',
        events: Array(3).fill(expect.objectContaining({ name: 'update' })),
      }),
    ]);
  });

  it.each([
    {
      events: [{ _e: 'build:done', _t: 1000, _d: 200 }],
      start: '800000000',
      end: '1000000000',
    },
    {
      events: [
        { _e: 'build:point', _t: 1200 },
        { _e: 'root:init', _t: 950, version: '1.0.0' },
        { _e: 'build:done', _t: 1100, _d: 400.25 },
        { _e: 'build:done', _t: 1000, _d: 200 },
      ],
      start: '699750000',
      end: '1200000000',
    },
  ])(
    'encloses the exported events from $start to $end',
    async ({ events, start, end }) => {
      const output = await convertToOpenTelemetry(events);
      const [parent, ...children] = output.resourceSpans[0].scopeSpans[0].spans;
      expect(parent.startTimeUnixNano).toBe(start);
      expect(parent.endTimeUnixNano).toBe(end);
      for (const child of children) {
        expect(child.parentSpanId).toBe(parent.spanId);
        expect(BigInt(child.startTimeUnixNano)).toBeGreaterThanOrEqual(
          BigInt(start)
        );
        expect(BigInt(child.endTimeUnixNano)).toBeLessThanOrEqual(BigInt(end));
      }
    }
  );

  it('maps 2g spans and instants to OTLP JSON resource spans', async () => {
    const output = await convertToOpenTelemetry(
      [
        {
          _e: 'root:init',
          _t: 900,

          version: '1.0.0',
        },
        { _e: 'env:mode', _t: 1000, mode: 'development' },
        { _e: 'metro:bundling:done', _t: 1500, _d: 250.25, id: 'a' },
      ],
      { processName: 'expo start', pid: 123 }
    );

    const resourceSpan = output.resourceSpans[0];
    expect(resourceSpan.resource.attributes).toContainEqual({
      key: 'service.name',
      value: { stringValue: 'expo start' },
    });
    expect(resourceSpan.resource.attributes).toContainEqual({
      key: 'process.pid',
      value: { intValue: '123' },
    });

    const spans = resourceSpan.scopeSpans[0].spans;
    expect(spans[0]).toMatchObject({
      name: 'expo start',
      startTimeUnixNano: '900000000',
      endTimeUnixNano: '1500000000',
    });
    expect(spans[0].events).toContainEqual(
      expect.objectContaining({
        name: 'mode',
        timeUnixNano: '1000000000',
      })
    );
    expect(spans[1]).toMatchObject({
      name: 'bundling',
      startTimeUnixNano: '1249750000',
      endTimeUnixNano: '1500000000',
    });
    expect(spans[1].attributes).toContainEqual({
      key: 'event_log.id',
      value: { stringValue: 'a' },
    });
  });
});
