import { performance } from 'node:perf_hooks';

import type { EventSink } from './logStream';

const TIME_ORIGIN = performance.timeOrigin;

const TIMESTAMP_FRACTIONS = Array.from(
  { length: 1000 },
  (_, us) => `.${`${us}`.padStart(3, '0')}`
);

let cachedMs = -1;
let cachedMsJson = '';
let cachedWorkerId: string | undefined;
let cachedWorkerIdJson = '';

export interface EventMeta {
  _w?: string;
}

export function serializeEvent(
  category: string,
  kind: string,
  payload: Record<string, unknown> | undefined,
  meta?: EventMeta,
  duration?: number,
  level?: number
) {
  const timestamp = stringifyTimestamp();
  if (duration == null && !meta?._w && !level) {
    const rest = payload ? JSON.stringify(payload).slice(1) : '';
    return rest.length > 1
      ? `{"_e":"${category}:${kind}","_t":${timestamp},${rest}\n`
      : `{"_e":"${category}:${kind}","_t":${timestamp}}\n`;
  }

  let line = `{"_e":"${category}:${kind}","_t":${timestamp}`;
  if (duration != null) line += `,"_d":${duration}`;
  if (level) line += `,"_l":${level}`;
  if (meta?._w) line += `,"_w":${stringifyWorkerId(meta._w)}`;
  return `${appendPayload(line, payload)}}\n`;
}

export function writeEvent(
  dest: EventSink,
  category: string,
  kind: string,
  payload: Record<string, unknown> | undefined,
  meta?: EventMeta,
  level?: number
) {
  // Unserializable payloads (circular, BigInt) drop the event, never throw into the host
  try {
    dest._writeln(
      serializeEvent(category, kind, payload, meta, undefined, level)
    );
  } catch {}
}

export function writeCompleteEvent(
  dest: EventSink,
  category: string,
  kind: string,
  startPayload: Record<string, unknown> | undefined,
  endPayload: Record<string, unknown> | undefined,
  delta: number,
  meta?: EventMeta,
  level?: number
) {
  try {
    let line = `{"_e":"${category}:${kind}","_t":${stringifyTimestamp()},"_d":${delta}`;
    if (level) line += `,"_l":${level}`;
    if (meta?._w) line += `,"_w":${stringifyWorkerId(meta._w)}`;
    dest._writeln(`${appendMergedPayload(line, startPayload, endPayload)}}\n`);
  } catch {}
}

export function getEventTimestamp() {
  return TIME_ORIGIN + performance.now();
}

function stringifyTimestamp() {
  const timestamp = TIME_ORIGIN + performance.now();
  const ms = Math.floor(timestamp);
  if (ms !== cachedMs) {
    cachedMs = ms;
    cachedMsJson = `${ms}`;
  }
  return cachedMsJson + TIMESTAMP_FRACTIONS[((timestamp - ms) * 1000) | 0];
}

function stringifyWorkerId(workerId: string) {
  if (workerId !== cachedWorkerId) {
    cachedWorkerId = workerId;
    cachedWorkerIdJson = JSON.stringify(workerId);
  }
  return cachedWorkerIdJson;
}

function appendPayload(line: string, payload?: Record<string, unknown>) {
  if (!payload) return line;
  const rest = JSON.stringify(payload);
  return rest && rest.length > 2 ? `${line},${rest.slice(1, -1)}` : line;
}

function appendMergedPayload(
  line: string,
  startPayload?: Record<string, unknown>,
  endPayload?: Record<string, unknown>
) {
  if (!startPayload) return appendPayload(line, endPayload);
  if (!endPayload) return appendPayload(line, startPayload);
  return appendPayload(line, Object.assign(startPayload, endPayload));
}
