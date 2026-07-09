import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { EVENT_LEVEL_DEBUG } from './constants';
import { eventLogState } from './state';
import { writeCompleteEvent, writeEvent } from './utils/serializeEvent';
import type { EventLogger, SerializedError, SpanEnd } from './types';

const NOOP_DONE: SpanEnd<any> = () => {};

function serializeError(
  error: unknown,
  depth = 0
): SerializedError | string | null {
  if (error == null) return null;
  if (!(error instanceof Error)) return String(error);
  const serialized: SerializedError = {
    name: error.name,
    message: error.message,
  };
  const code = (error as NodeJS.ErrnoException).code;
  if (typeof code === 'string') serialized.code = code;
  const stack = error.stack;
  if (stack) serialized.stack = stack;
  // The depth cap guards cyclic causes
  if (error.cause != null && depth < 4)
    serialized.cause = serializeError(error.cause, depth + 1)!;
  return serialized;
}

function createEventLogger<const Category extends string>(
  category: Category,
  level: number | undefined
): EventLogger<Category> {
  function log(event: string, data?: Record<string, unknown>) {
    if (eventLogState.primarySink && (!level || eventLogState.debug))
      writeEvent(
        eventLogState.primarySink,
        category,
        event,
        data,
        eventLogState.eventMeta,
        level
      );
  }

  log.span = function span() {
    if (!eventLogState.primarySink || (level && !eventLogState.debug))
      return NOOP_DONE;
    const start = performance.now();
    return function done(event: string, data?: Record<string, unknown>) {
      if (!eventLogState.primarySink) return;
      writeCompleteEvent(
        eventLogState.primarySink,
        category,
        event,
        data,
        undefined,
        performance.now() - start,
        eventLogState.eventMeta,
        level
      );
    };
  };

  log.path = function relativePath(target: string | undefined | null) {
    return {
      toJSON(): string | null {
        try {
          return target != null && path.isAbsolute(target)
            ? path
                .relative(eventLogState.logPath, target)
                .replace(/\\/g, '/') || '.'
            : (target ?? null);
        } catch {
          return target || null;
        }
      },
    };
  };

  log.error = function error(error: unknown) {
    return {
      toJSON: () => serializeError(error),
    };
  };
  log.category = category;
  return log as EventLogger<Category>;
}

export function events<const Category extends string>(
  category: Category
): EventLogger<Category> {
  return createEventLogger(category, undefined);
}

events.debug = function debug<const Category extends string>(
  category: Category
): EventLogger<Category> {
  return createEventLogger(category, EVENT_LEVEL_DEBUG);
};
