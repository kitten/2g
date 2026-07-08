import { styleText } from 'node:util';

import type { ParsedEvent } from '../types';

const CATEGORY_COLORS = [
  'cyan',
  'green',
  'yellow',
  'blue',
  'magenta',
  'red',
] as const;

export function formatPrettyEvent(
  event: ParsedEvent,
  options: { colorize: boolean; stream?: NodeJS.WritableStream }
) {
  const timestamp = formatTimestamp(new Date(event._t).toISOString(), options);
  const duration =
    typeof event._d === 'number' ? ` ${formatSpanDuration(event._d)}` : '';
  return `${timestamp} ${formatPrettyEventName(
    event._e,
    options
  )}${duration} ${JSON.stringify(event)}`;
}

function formatTimestamp(
  timestamp: string,
  options: { colorize: boolean; stream?: NodeJS.WritableStream }
) {
  if (!options.colorize) return timestamp;
  return styleText('dim', timestamp, {
    stream: options.stream ?? process.stdout,
  });
}

export function formatPrettyEventName(
  eventName: string,
  options: { colorize: boolean; stream?: NodeJS.WritableStream }
) {
  if (!options.colorize) return eventName;
  return styleText(pickCategoryColor(eventName), eventName, {
    stream: options.stream ?? process.stdout,
  });
}

export function shouldColorizeStream(stream: NodeJS.WriteStream) {
  return (
    stream.isTTY === true &&
    (typeof stream.hasColors !== 'function' || stream.hasColors())
  );
}

export function formatSpanDuration(durationMs: number) {
  if (durationMs < 1000) return `${formatDurationNumber(durationMs)}ms`;
  if (durationMs < 60_000) return `${formatDurationNumber(durationMs / 1000)}s`;
  return `${formatDurationNumber(durationMs / 60_000)}m`;
}

function pickCategoryColor(eventName: string) {
  const separator = eventName.indexOf(':');
  const category = separator === -1 ? eventName : eventName.slice(0, separator);
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash << 5) - hash + category.charCodeAt(i);
    hash |= 0;
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

function formatDurationNumber(value: number) {
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return value.toFixed(1).replace(/\.0$/, '');
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
