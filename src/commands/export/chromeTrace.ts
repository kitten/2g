import { ExportContext, type ExportOptions } from './context';
import type { ParsedEvent } from '../../types';

export interface ConvertToChromeTraceOptions extends ExportOptions {}

export interface TraceFile {
  traceEvents: TraceEvent[];
  metadata: {
    source: '2g';
    version?: string;
    convertedAt: string;
    startTime: string;
    startTimestampMs: number;
  };
}

export type TraceEvent = TraceComplete | TraceInstant | TraceMetadata;

export interface TraceComplete {
  ph: 'X';
  name: string;
  cat: string;
  pid: number;
  tid: number;
  ts: number;
  dur: number;
  args?: Record<string, unknown>;
}

export interface TraceInstant {
  ph: 'i';
  name: string;
  cat: string;
  pid: number;
  tid: number;
  ts: number;
  s: 'g' | 'p' | 't';
  args?: Record<string, unknown>;
}

export interface TraceMetadata {
  ph: 'M';
  name: 'process_name' | 'thread_name' | 'thread_sort_index';
  pid: number;
  tid?: number;
  args: Record<string, unknown>;
}

const STRIP_SUFFIXES = [':started', ':done', ':failed'];

export async function convertToChromeTrace(
  events: Iterable<ParsedEvent> | AsyncIterable<ParsedEvent>,
  options: ConvertToChromeTraceOptions = {}
): Promise<TraceFile> {
  const converter = new TraceConverter(options);
  for await (const event of events) {
    converter.add(event);
  }
  return converter.toTraceFile();
}

interface Track {
  name: string;
  spans: PendingSpan[];
  tid: number;
}

interface PendingSpan {
  track: Track;
  name: string;
  cat: string;
  ts: number;
  dur: number;
  args?: Record<string, unknown>;
  lane: number;
}

interface PendingInstant {
  track: Track;
  name: string;
  cat: string;
  ts: number;
  args?: Record<string, unknown>;
}

type PendingEvent =
  | ({ kind: 'span' } & PendingSpan)
  | ({ kind: 'instant' } & PendingInstant);

export class TraceConverter {
  #pending: PendingEvent[] = [];
  #tracks = new Map<string, Track>();
  #pid: number;
  #context: ExportContext;

  constructor(options: ConvertToChromeTraceOptions = {}) {
    this.#pid = options.pid ?? 1;
    this.#context = new ExportContext(options);
  }

  add(input: ParsedEvent) {
    const event = this.#context.read(input);
    if (!event) return;

    const parsed = splitEventName(event._e);
    const track = this.#getTrack(
      parsed.category,
      typeof event._w === 'string' ? event._w : undefined
    );
    const args = extractArgs(event);

    if (typeof event._d === 'number') {
      const span: PendingEvent = {
        kind: 'span',
        track,
        name: stripSuffix(parsed.name),
        cat: parsed.category,
        ts: Math.round((event._t - event._d) * 1000),
        dur: Math.round(event._d * 1000),
        args,
        lane: 0,
      };
      track.spans.push(span);
      this.#pending.push(span);
    } else {
      this.#pending.push({
        kind: 'instant',
        track,
        name: stripSuffix(parsed.name),
        cat: parsed.category,
        ts: Math.round(event._t * 1000),
        args,
      });
    }
  }

  toTraceFile(): TraceFile {
    let base = this.#pending.length ? Infinity : 0;
    for (const event of this.#pending) {
      if (event.ts < base) base = event.ts;
    }
    const traceEvents: TraceEvent[] = [
      {
        ph: 'M',
        name: 'process_name',
        pid: this.#pid,
        args: { name: this.#context.processName },
      },
    ];

    let nextTid = 1;
    for (const track of this.#tracks.values()) {
      const laneCount = Math.max(assignLanes(track.spans), 1);
      track.tid = nextTid;
      for (let lane = 0; lane < laneCount; lane++) {
        const tid = nextTid++;
        traceEvents.push(
          {
            ph: 'M',
            name: 'thread_name',
            pid: this.#pid,
            tid,
            args: {
              name: lane === 0 ? track.name : `${track.name} #${lane + 1}`,
            },
          },
          {
            ph: 'M',
            name: 'thread_sort_index',
            pid: this.#pid,
            tid,
            args: { sort_index: tid },
          }
        );
      }
    }

    for (const event of this.#pending) {
      const lane = event.kind === 'span' ? event.lane : 0;
      const tid = event.track.tid + lane;
      if (event.kind === 'span') {
        traceEvents.push({
          ph: 'X',
          name: event.name,
          cat: event.cat,
          pid: this.#pid,
          tid,
          ts: event.ts - base,
          dur: event.dur,
          args: event.args,
        });
      } else {
        traceEvents.push({
          ph: 'i',
          name: event.name,
          cat: event.cat,
          pid: this.#pid,
          tid,
          ts: event.ts - base,
          s: 't',
          args: event.args,
        });
      }
    }

    return {
      traceEvents,
      metadata: {
        source: '2g',
        version: this.#context.version,
        convertedAt: new Date().toISOString(),
        startTime: new Date(base / 1000).toISOString(),
        startTimestampMs: base / 1000,
      },
    };
  }

  #getTrack(category: string, worker?: string) {
    const key = worker ? `${category}:${worker}` : category;
    let track = this.#tracks.get(key);
    if (!track) {
      track = {
        name: worker ? `${category} ${worker}` : category,
        spans: [],
        tid: 0,
      };
      this.#tracks.set(key, track);
    }
    return track;
  }
}

// 'X' events on one tid nest by containment; partial overlap is invalid.
function assignLanes(spans: PendingSpan[]) {
  spans.sort((a, b) => a.ts - b.ts || b.ts + b.dur - (a.ts + a.dur));
  const lanes: PendingSpan[][] = [];
  for (const span of spans) {
    const end = span.ts + span.dur;
    let lane = -1;
    for (let index = 0; index < lanes.length; index++) {
      const stack = lanes[index];
      while (
        stack.length &&
        stack[stack.length - 1].ts + stack[stack.length - 1].dur <= span.ts
      ) {
        stack.pop();
      }
      const top = stack[stack.length - 1];
      if (!top || top.ts + top.dur >= end) {
        stack.push(span);
        lane = index;
        break;
      }
    }
    if (lane < 0) {
      lanes.push([span]);
      lane = lanes.length - 1;
    }
    span.lane = lane;
  }
  return lanes.length;
}

function splitEventName(value: string) {
  const index = value.indexOf(':');
  if (index < 1) return { category: 'uncategorized', name: value };
  return {
    category: value.slice(0, index),
    name: value.slice(index + 1),
  };
}

function stripSuffix(name: string) {
  for (const suffix of STRIP_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  return name;
}

function extractArgs(event: ParsedEvent) {
  const args: Record<string, unknown> = {};
  for (const key of Object.keys(event)) {
    if (key.startsWith('_')) continue;
    args[key] = event[key];
  }
  return Object.keys(args).length ? args : undefined;
}
