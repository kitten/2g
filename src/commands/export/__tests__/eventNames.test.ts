import { describe, expect, it } from 'vitest';

import { convertToChromeTrace } from '../chromeTrace';
import { convertToOpenTelemetry } from '../opentelemetry';

describe('exported event names', () => {
  it.each([
    ['build:step:started', 'step', 'step', 'build'],
    ['build:step:done', 'step', 'step', 'build'],
    ['build:step:failed', 'step', 'step', 'build'],
    ['build:step:done:failed', 'step:done', 'step:done', 'build'],
    ['build:step:done:extra', 'step:done:extra', 'step:done:extra', 'build'],
    ['build:done', 'done', 'done', 'build'],
    ['build:', '', '', 'build'],
    ['boot', 'boot', 'boot', 'uncategorized'],
    [':done', '', ':done', 'uncategorized'],
  ])(
    'preserves format-specific naming for %s',
    async (_e, chrome, otel, cat) => {
      const events = [
        { _e, _t: 100 },
        { _e, _t: 200, _d: 10 },
      ];
      const trace = await convertToChromeTrace(events);
      expect(
        trace.traceEvents
          .filter(event => event.ph !== 'M')
          .map(event => ({ name: event.name, cat: event.cat }))
      ).toEqual([
        { name: chrome, cat },
        { name: chrome, cat },
      ]);

      const telemetry = await convertToOpenTelemetry(events);
      const [session, span] = telemetry.resourceSpans[0].scopeSpans[0].spans;
      expect(session.events?.[0].name).toBe(otel);
      expect(span.name).toBe(otel);
    }
  );
});
