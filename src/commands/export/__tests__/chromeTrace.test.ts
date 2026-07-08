import { describe, expect, it } from 'vitest';

import { convertToChromeTrace } from '../chromeTrace';

describe('trace', () => {
  it('maps metadata, instants, spans, and workers to Chrome trace events', async () => {
    const trace = await convertToChromeTrace(
      [
        { _e: 'root:init', _t: 900, format: 'v0-jsonl', version: '1.0.0' },
        { _e: 'env:mode', _t: 1000, mode: 'development' },
        { _e: 'metro:bundling:done', _t: 1500, _d: 250.25, id: 'a' },
        {
          _e: 'metro:transform:done',
          _t: 1600,
          _d: 20,
          _w: 'w1',
          file: 'App.tsx',
        },
      ],
      { processName: 'expo start' }
    );

    expect(trace.metadata.version).toBe('1.0.0');
    expect(trace.traceEvents).toContainEqual(
      expect.objectContaining({
        ph: 'i',
        name: 'mode',
        cat: 'env',
        ts: 0,
        s: 't',
      })
    );
    expect(trace.traceEvents).toContainEqual(
      expect.objectContaining({
        ph: 'X',
        name: 'bundling',
        cat: 'metro',
        ts: 249_750,
        dur: 250_250,
      })
    );
    expect(trace.traceEvents).toContainEqual(
      expect.objectContaining({
        ph: 'M',
        name: 'thread_name',
        args: { name: 'metro w1' },
      })
    );
  });

  it('spills partially overlapping spans to adjacent lanes', async () => {
    const trace = await convertToChromeTrace([
      { _e: 'metro:a:done', _t: 100, _d: 100 },
      { _e: 'metro:b:done', _t: 150, _d: 100 },
    ]);

    const threads = trace.traceEvents.filter(
      event => event.ph === 'M' && event.name === 'thread_name'
    );
    expect(threads.map(event => event.args)).toEqual([
      { name: 'metro' },
      { name: 'metro #2' },
    ]);

    const spans = trace.traceEvents.filter(event => event.ph === 'X');
    expect(spans.map(event => event.tid)).toEqual([1, 2]);
  });

  it('nests contained spans on a single lane', async () => {
    const trace = await convertToChromeTrace([
      { _e: 'metro:a:done', _t: 100, _d: 100 },
      { _e: 'metro:b:done', _t: 50, _d: 40 },
    ]);

    const threads = trace.traceEvents.filter(
      event => event.ph === 'M' && event.name === 'thread_name'
    );
    expect(threads.map(event => event.args)).toEqual([{ name: 'metro' }]);

    const spans = trace.traceEvents.filter(event => event.ph === 'X');
    expect(spans.map(event => event.tid)).toEqual([1, 1]);
  });

  it('assigns lanes per worker track independently', async () => {
    const trace = await convertToChromeTrace([
      { _e: 'metro:a:done', _t: 100, _d: 100, _w: 'w1' },
      { _e: 'metro:b:done', _t: 150, _d: 100, _w: 'w1' },
      { _e: 'metro:c:done', _t: 150, _d: 100 },
    ]);

    const threads = trace.traceEvents.filter(
      event => event.ph === 'M' && event.name === 'thread_name'
    );
    expect(threads.map(event => event.args)).toEqual([
      { name: 'metro w1' },
      { name: 'metro w1 #2' },
      { name: 'metro' },
    ]);
  });

  it('excludes underscore-prefixed keys from args', async () => {
    const trace = await convertToChromeTrace([
      {
        _e: 'metro:transform:done',
        _t: 100,
        _d: 10,
        _w: 'w1',
        _x: 1,
        file: 'App.tsx',
      },
    ]);

    const span = trace.traceEvents.find(event => event.ph === 'X');
    expect(span?.args).toEqual({ file: 'App.tsx' });
  });

  it('normalizes timestamps and records the absolute start in metadata', async () => {
    const trace = await convertToChromeTrace([
      { _e: 'env:mode', _t: 1000 },
      { _e: 'metro:bundle:done', _t: 1500, _d: 100 },
    ]);

    expect(trace.metadata.startTimestampMs).toBe(1000);
    expect(trace.metadata.startTime).toBe(new Date(1000).toISOString());
    const timestamps = trace.traceEvents
      .filter(event => event.ph !== 'M')
      .map(event => event.ts);
    expect(Math.min(...timestamps)).toBe(0);
  });

  it('emits a single process_name carrying the version-derived name', async () => {
    const trace = await convertToChromeTrace([
      { _e: 'root:init', _t: 900, version: '1.0.0' },
      { _e: 'env:mode', _t: 1000 },
    ]);

    const processNames = trace.traceEvents.filter(
      event => event.ph === 'M' && event.name === 'process_name'
    );
    expect(processNames).toEqual([
      expect.objectContaining({ args: { name: '2g (v1.0.0)' } }),
    ]);
  });

  it('falls back to an uncategorized track for colon-less event names', async () => {
    const trace = await convertToChromeTrace([{ _e: 'boot', _t: 1000 }]);

    expect(trace.traceEvents).toContainEqual(
      expect.objectContaining({ ph: 'i', name: 'boot', cat: 'uncategorized' })
    );
    expect(trace.traceEvents).toContainEqual(
      expect.objectContaining({
        ph: 'M',
        name: 'thread_name',
        args: { name: 'uncategorized' },
      })
    );
  });

  it('converts inputs beyond the argument-spread limit', async () => {
    const events = Array.from({ length: 300_000 }, (_, index) => ({
      _e: 'cli:tick',
      _t: 1000 + index,
    }));

    const trace = await convertToChromeTrace(events);
    expect(trace.traceEvents).toHaveLength(300_003);
    expect(trace.metadata.startTimestampMs).toBe(1000);
  });

  it('produces identical trace events for identical input', async () => {
    const events = [
      { _e: 'metro:a:done', _t: 100, _d: 100 },
      { _e: 'metro:b:done', _t: 150, _d: 100 },
      { _e: 'metro:c:done', _t: 120, _d: 10 },
      { _e: 'env:mode', _t: 90 },
    ];

    const first = await convertToChromeTrace(events);
    const second = await convertToChromeTrace(events);
    expect(second.traceEvents).toEqual(first.traceEvents);
  });
});
