import type { ParsedEvent } from '../types';

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  msec: 1,
  msecs: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
};

export interface EventFilterOptions {
  since?: number | string | Date;
  filter?: string | string[];
  spans?: boolean;
  debug?: boolean;
}

export function parseEventLine(
  line: string,
  options: EventFilterOptions = {},
  eventFilter = compileEventFilter(options.filter),
  since = parseSince(options.since)
): ParsedEvent | null {
  try {
    const event = JSON.parse(line) as ParsedEvent;
    return event &&
      typeof event._e === 'string' &&
      typeof event._t === 'number' &&
      matches(event, options.debug, since, options.spans, eventFilter)
      ? event
      : null;
  } catch {
    return null;
  }
}

export function parseSince(value: EventFilterOptions['since']) {
  if (value == null) return undefined;
  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (Number.isFinite(timestamp)) return timestamp;
    throw new Error(`Invalid since: ${value.toString()}`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Invalid since: ${value}`);
    return normalizeUnixTimestamp(value);
  }

  const input = value.trim();
  if (!input) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(input))
    return normalizeUnixTimestamp(Number(input));

  const duration = parseDuration(input);
  if (duration != null) return Date.now() - duration;

  const timestamp = Date.parse(input);
  if (Number.isFinite(timestamp)) return timestamp;
  throw new Error(`Invalid since: ${value}`);
}

export function parseDuration(value: string) {
  const input = value.trim().toLowerCase();
  if (!input) return undefined;

  let total = 0;
  let index = 0;
  const pattern =
    /(\d+(?:\.\d+)?)\s*(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)?/gy;

  while (index < input.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(input);
    if (!match) return undefined;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return undefined;
    total += amount * DURATION_UNITS[match[2] ?? 'ms'];
    index = pattern.lastIndex;
    while (input[index] === ' ' || input[index] === ',') index++;
  }

  return total;
}

export function compileEventFilter(filter: string | string[] | undefined) {
  const patterns = normalizeEventFilter(filter);
  if (!patterns.length) return null;
  return new RegExp(`^(?:${patterns.map(eventPatternToRegex).join('|')})$`);
}

export function matchesTapOptions(
  event: ParsedEvent,
  options: {
    since?: number;
    spans?: boolean;
    debug?: boolean;
    filter?: EventFilterOptions['filter'];
  },
  eventFilter = compileEventFilter(options.filter)
) {
  return matches(
    event,
    options.debug,
    options.since,
    options.spans,
    eventFilter
  );
}

function matches(
  event: ParsedEvent,
  debug: boolean | undefined,
  since: number | undefined,
  spans: boolean | undefined,
  eventFilter: RegExp | null
) {
  if (debug !== true && event._l) return false;
  if (since !== undefined && event._t < since) return false;
  if (spans === true && typeof event._d !== 'number') return false;
  return !eventFilter || eventFilter.test(event._e);
}

function normalizeEventFilter(filter: string | string[] | undefined) {
  const values = Array.isArray(filter) ? filter : filter ? [filter] : [];
  return values
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean);
}

function eventPatternToRegex(pattern: string) {
  if (pattern.includes('*')) {
    return pattern.split('*').map(escapeRegex).join('.*');
  } else {
    return `${escapeRegex(pattern)}(?::.*)?`;
  }
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function normalizeUnixTimestamp(value: number) {
  return value < 10_000_000_000 ? value * 1000 : value;
}
