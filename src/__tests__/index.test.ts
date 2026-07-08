import { describe, expect, it } from 'vitest';

import * as index from '../index';
import * as api from '../api';

describe('index', () => {
  it('re-exports the producer API surface', () => {
    expect(index).toMatchObject({
      events: expect.any(Function),
      installEventLogger: expect.any(Function),
      flushEventLogger: expect.any(Function),
      getEventLoggerInfo: expect.any(Function),
    });
    expect(index.events.debug).toEqual(expect.any(Function));
    expect(index).not.toHaveProperty('list');
    expect(index).not.toHaveProperty('resolveSession');
    expect(index).not.toHaveProperty('tap');
    expect(index).not.toHaveProperty('filterSessions');
    expect(index).not.toHaveProperty('formatSessionSelector');
    expect(index).not.toHaveProperty('listSessions');
    expect(index).not.toHaveProperty('_serializeEventForTesting');
    expect(index).not.toHaveProperty('getLogFile');
    expect(index).not.toHaveProperty('getSession');
    expect(index).not.toHaveProperty('getWellKnownTemporaryLogFile');
    expect(index).not.toHaveProperty('rootEvent');
    expect(index).not.toHaveProperty('LogStream');
  });
});

describe('api', () => {
  it('re-exports the consumption API surface', () => {
    expect(api).toMatchObject({
      list: expect.any(Function),
      resolveSession: expect.any(Function),
      tap: expect.any(Function),
      captureEvents: expect.any(Function),
    });
    expect(api).not.toHaveProperty('events');
    expect(api).not.toHaveProperty('installEventLogger');
    expect(api).not.toHaveProperty('listSessions');
    expect(api).not.toHaveProperty('filterSessions');
    expect(api).not.toHaveProperty('formatSessionSelector');
    expect(api).not.toHaveProperty('parseEventLine');
  });
});
