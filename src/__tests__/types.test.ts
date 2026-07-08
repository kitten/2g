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
});
