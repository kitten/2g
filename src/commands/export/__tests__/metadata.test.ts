import { describe, expect, it } from 'vitest';
import { convertToChromeTrace } from '../chromeTrace';
import { convertToOpenTelemetry } from '../opentelemetry';
import type { ExportOptions } from '../context';

const events = [
  { _e: 'root:init', _t: 1000, metadata: { version: '1', port: 8081 } },
  { _e: 'root:metadata', _t: 1050, metadata: { version: '2' } },
  {
    _e: 'root:metadata',
    _t: 1100,
    _w: 'child:1',
    metadata: { version: 'child', ready: true },
  },
  {
    _e: 'root:init',
    _t: 1150,
    _w: 'child:2',
    metadata: { version: 'child-init' },
  },
  { _e: 'app:done', _t: 1300, _d: 100 },
];

describe('export metadata', () => {
  it.each([{ filter: 'app:*' }, { spans: true }, { since: new Date(1200) }])(
    'retains root version through child metadata and filtering with %j',
    async filter => {
      const options: ExportOptions = {
        ...filter,
        command: 'expo start',
        pid: 12,
      };
      const trace = await convertToChromeTrace(events, options);
      expect(trace.metadata.version).toBe('2');
      expect(
        trace.traceEvents.find(event => event.name === 'process_name')?.args
      ).toEqual({ name: 'expo start (v2, PID 12)' });
      expect(trace.traceEvents.filter(event => event.ph !== 'M')).toHaveLength(
        1
      );
      const otel = await convertToOpenTelemetry(events, options);
      const resource = otel.resourceSpans[0];
      expect(resource.resource.attributes).toContainEqual({
        key: 'service.version',
        value: { stringValue: '2' },
      });
      expect(resource.scopeSpans[0].spans[0].events).toBeUndefined();
      expect(resource.scopeSpans[0].spans[0].name).toBe(
        'expo start (v2, PID 12)'
      );
    }
  );
  it('retains initial metadata and updates as points with attribution', async () => {
    const trace = await convertToChromeTrace(events, {
      processName: 'explicit',
    });
    const points = trace.traceEvents.filter(event => event.ph === 'i');
    expect(points.map(event => event.args)).toEqual([
      { metadata: { version: '1', port: 8081 } },
      { metadata: { version: '2' } },
      { metadata: { version: 'child', ready: true } },
      { metadata: { version: 'child-init' } },
    ]);
    expect(
      trace.traceEvents.find(event => event.name === 'process_name')?.args
    ).toEqual({ name: 'explicit' });
    expect(trace.traceEvents).toContainEqual(
      expect.objectContaining({
        name: 'thread_name',
        args: { name: 'root child:1' },
      })
    );
    const otel = await convertToOpenTelemetry(events, {
      processName: 'explicit',
    });
    expect(otel.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('explicit');
    expect(otel.resourceSpans[0].scopeSpans[0].spans[0].events).toHaveLength(4);
  });
  it('does not recover missing version from legacy or incomplete input', async () => {
    const incomplete = [
      { _e: 'root:init', _t: 1, version: 'legacy' },
      { _e: 'root:metadata', _t: 2, metadata: { port: 8081 } },
      {
        _e: 'root:metadata',
        _t: 3,
        _w: 'child',
        metadata: { version: 'child' },
      },
    ];
    const trace = await convertToChromeTrace(incomplete);
    expect(JSON.parse(JSON.stringify(trace)).metadata).not.toHaveProperty(
      'version'
    );
    const otel = await convertToOpenTelemetry(incomplete);
    expect(
      otel.resourceSpans[0].resource.attributes.some(
        attr => attr.key === 'service.version'
      )
    ).toBe(false);
  });
});
