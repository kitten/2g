import { describe, expect, it } from 'vitest';

import { convertToOpenTelemetry } from '../opentelemetry';

describe('opentelemetry', () => {
  it('maps 2g spans and instants to OTLP JSON resource spans', async () => {
    const output = await convertToOpenTelemetry(
      [
        { _e: 'root:init', _t: 900, format: 'v0-jsonl', version: '1.0.0' },
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
