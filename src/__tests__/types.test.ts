import { describe, expectTypeOf, it } from 'vitest';

import { events } from '../events';
import type { EventLogger, EventPayload } from '../types';

declare module '../types' {
  interface EventRegistry {
    'types:done': { count: number };
    'types:bad': { _e: string };
    'types:loose': { count?: number };
  }
}

describe('types', () => {
  it('derives payloads from EventRegistry and rejects reserved payload fields', () => {
    expectTypeOf<EventPayload<'types', 'done'>>().toEqualTypeOf<{
      count: number;
    }>();
    expectTypeOf<EventPayload<'types', 'bad'>>().toEqualTypeOf<never>();
  });

  it('allows free-form custom events without reserved payload fields', () => {
    expectTypeOf<EventPayload<'custom', 'note'>>().toEqualTypeOf<
      Record<string, unknown>
    >();
    expectTypeOf<EventLogger<'custom'>>().parameter(0).toEqualTypeOf<string>();
    expectTypeOf<EventLogger<'custom'>>()
      .parameter(1)
      .toEqualTypeOf<Record<string, unknown> | undefined>();
  });

  it('makes payloads without required keys optional', () => {
    const log = events('types');
    log('loose');
    log('loose', { count: 1 });
    log('done', { count: 1 });
    // @ts-expect-error required payload must be passed
    log('done');
    // @ts-expect-error unknown event names are not callable
    log('unknown');
    // @ts-expect-error wrong payload shape
    log('done', { count: 'one' });
  });

  it('types events.debug identically to events', () => {
    expectTypeOf(events.debug('types')).toEqualTypeOf(events('types'));
    expectTypeOf(events.debug('types').category).toEqualTypeOf<'types'>();
  });

  it('checks literal names while leaving dynamic strings to the caller', () => {
    const log = events('custom');
    log('Build_2.done:cache-hit');
    log.span()('span:done');
    const dynamic: string = 'configured-name';
    log(dynamic);
    log.span()(dynamic);
    events.debug('custom')(dynamic);
    events(dynamic);
    events.debug(dynamic);
    // @ts-expect-error quotes are not identifier characters
    log('say"hello');
    // @ts-expect-error backslashes require JSON escaping
    log('path\\name');
    // @ts-expect-error control characters are not identifier characters
    log('line\n');
    // @ts-expect-error non-ASCII names are outside the convention
    log('café');
    // @ts-expect-error empty names are not identifiers
    log('');
    // @ts-expect-error spans have the same name constraint
    log.span()('bad name');
    // @ts-expect-error debug events have the same name constraint
    events.debug('custom')('bad/name');
    // @ts-expect-error categories have the same name constraint
    events('bad"category');
    // @ts-expect-error debug categories have the same name constraint
    events.debug('bad\\category');
    const mixed = Math.random() ? 'good' : 'bad"name';
    // @ts-expect-error every member of a union must be safe
    log(mixed);
  });
});
