import { bench, describe } from 'vitest';

import { getEventTimestamp, serializeEvent } from '../serializeEvent';

const payload = {
  id: 'bundle-ios',
  platform: 'ios',
  entry: 'App.tsx',
  total: 2483,
  cached: false,
};

describe('serializeEvent', () => {
  bench('Date.now timestamp', () => {
    Date.now();
  });

  bench('high-resolution timestamp', () => {
    getEventTimestamp();
  });

  bench('current instant event', () => {
    serializeEvent('metro', 'bundling:progress', payload);
  });

  bench('current worker event', () => {
    serializeEvent('metro', 'transform:done', payload, { _w: 'worker:1' });
  });

  bench('debug instant event', () => {
    serializeEvent(
      'metro',
      'bundling:progress',
      payload,
      undefined,
      undefined,
      1
    );
  });

  bench('current span event', () => {
    serializeEvent('metro', 'bundling:done', payload, undefined, 42.25);
  });

  bench('object stringify baseline', () => {
    objectStringify('metro', 'bundling:progress', payload);
  });

  bench('expo-style splice baseline', () => {
    expoStyleSplice('metro', 'bundling:progress', payload);
  });
});

function objectStringify(
  category: string,
  kind: string,
  data: Record<string, unknown>
) {
  return `${JSON.stringify({
    _e: `${category}:${kind}`,
    _t: getEventTimestamp(),
    ...data,
  })}\n`;
}

function expoStyleSplice(
  category: string,
  kind: string,
  data: Record<string, unknown>
) {
  const timestamp = getEventTimestamp();
  const rest = JSON.stringify(data).slice(1);
  return rest.length > 1
    ? `{"_e":"${category}:${kind}","_t":${timestamp},${rest}\n`
    : `{"_e":"${category}:${kind}","_t":${timestamp}}\n`;
}
