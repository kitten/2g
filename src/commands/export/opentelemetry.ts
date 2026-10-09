import crypto from 'node:crypto';

import { ExportContext, type ExportOptions } from './context';
import { splitEventName, stripSuffix } from './eventName';
import type { ParsedEvent } from '../../types';

export interface ConvertToOpenTelemetryOptions extends ExportOptions {}

export interface OpenTelemetryFile {
  resourceSpans: OpenTelemetryResourceSpan[];
}

interface OpenTelemetryResourceSpan {
  resource: {
    attributes: OpenTelemetryAttribute[];
  };
  scopeSpans: Array<{
    scope: {
      name: string;
    };
    spans: OpenTelemetrySpan[];
  }>;
}

interface OpenTelemetrySpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes?: OpenTelemetryAttribute[];
  events?: OpenTelemetrySpanEvent[];
}

interface OpenTelemetrySpanEvent {
  timeUnixNano: string;
  name: string;
  attributes?: OpenTelemetryAttribute[];
}

interface OpenTelemetryAttribute {
  key: string;
  value: OpenTelemetryAnyValue;
}

type OpenTelemetryAnyValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean }
  | { arrayValue: { values: OpenTelemetryAnyValue[] } }
  | { kvlistValue: { values: OpenTelemetryAttribute[] } };

export async function convertToOpenTelemetry(
  events: Iterable<ParsedEvent> | AsyncIterable<ParsedEvent>,
  options: ConvertToOpenTelemetryOptions = {}
): Promise<OpenTelemetryFile> {
  const converter = new OpenTelemetryConverter(options);
  for await (const event of events) {
    converter.add(event);
  }
  return converter.toFile();
}

class OpenTelemetryConverter {
  readonly #traceId = crypto.randomBytes(16).toString('hex');
  readonly #sessionSpanId = createSpanId();
  readonly #spans: OpenTelemetrySpan[] = [];
  readonly #events: OpenTelemetrySpanEvent[] = [];
  #context: ExportContext;
  #startTimeUnixNano: bigint | undefined;
  #endTimeUnixNano: bigint | undefined;

  constructor(private readonly options: ConvertToOpenTelemetryOptions) {
    this.#context = new ExportContext(options);
  }

  add(input: ParsedEvent) {
    const event = this.#context.read(input);
    if (!event) return;
    const eventTime = unixNano(event._t);
    const startTime =
      typeof event._d === 'number' ? unixNano(event._t - event._d) : eventTime;
    this.#startTimeUnixNano =
      this.#startTimeUnixNano == null || startTime < this.#startTimeUnixNano
        ? startTime
        : this.#startTimeUnixNano;
    this.#endTimeUnixNano =
      this.#endTimeUnixNano == null || eventTime > this.#endTimeUnixNano
        ? eventTime
        : this.#endTimeUnixNano;

    if (typeof event._d === 'number') {
      this.#spans.push(this.#createSpan(event, startTime, eventTime));
    } else {
      this.#events.push(this.#createEvent(event, eventTime));
    }
  }

  toFile(): OpenTelemetryFile {
    const startTimeUnixNano = this.#startTimeUnixNano ?? unixNano(Date.now());
    const endTimeUnixNano = this.#endTimeUnixNano ?? startTimeUnixNano;
    return {
      resourceSpans: [
        {
          resource: {
            attributes: attributes({
              'service.name': this.#context.processName,
              'service.version': this.#context.version,
              'process.pid': this.options.pid,
              'telemetry.sdk.name': '2g',
              'telemetry.sdk.language': 'nodejs',
            }),
          },
          scopeSpans: [
            {
              scope: { name: '2g' },
              spans: [
                {
                  traceId: this.#traceId,
                  spanId: this.#sessionSpanId,
                  name: this.#context.processName,
                  startTimeUnixNano: String(startTimeUnixNano),
                  endTimeUnixNano: String(endTimeUnixNano),
                  attributes: attributes({
                    'event_log.kind': 'session',
                  }),
                  events: this.#events.length ? this.#events : undefined,
                },
                ...this.#spans,
              ],
            },
          ],
        },
      ],
    };
  }

  #createSpan(
    event: ParsedEvent,
    startTime: bigint,
    endTime: bigint
  ): OpenTelemetrySpan {
    const parsed = splitEventName(event._e);
    return {
      traceId: this.#traceId,
      spanId: createSpanId(),
      parentSpanId: this.#sessionSpanId,
      name: parsed ? stripSuffix(parsed.name) : event._e,
      startTimeUnixNano: String(startTime),
      endTimeUnixNano: String(endTime),
      attributes: eventAttributes(event, parsed),
    };
  }

  #createEvent(event: ParsedEvent, eventTime: bigint): OpenTelemetrySpanEvent {
    const parsed = splitEventName(event._e);
    return {
      timeUnixNano: String(eventTime),
      name: parsed ? stripSuffix(parsed.name) : event._e,
      attributes: eventAttributes(event, parsed),
    };
  }
}

function eventAttributes(
  event: ParsedEvent,
  parsed: ReturnType<typeof splitEventName>
) {
  const values: Record<string, unknown> = {
    'event.name': event._e,
  };
  if (parsed) {
    values['event.category'] = parsed.category;
    values['event.action'] = parsed.name;
  }
  if (typeof event._w === 'string') values['event.worker.id'] = event._w;

  for (const key of Object.keys(event)) {
    if (
      key === '_e' ||
      key === '_t' ||
      key === '_d' ||
      key === '_l' ||
      key === '_w'
    )
      continue;
    values[`event_log.${key}`] = event[key];
  }

  return attributes(values);
}

function attributes(values: Record<string, unknown>): OpenTelemetryAttribute[] {
  const result: OpenTelemetryAttribute[] = [];
  for (const [key, value] of Object.entries(values)) {
    const converted = anyValue(value);
    if (converted) result.push({ key, value: converted });
  }
  return result;
}

function anyValue(value: unknown): OpenTelemetryAnyValue | null {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.flatMap(item => {
          const converted = anyValue(item);
          return converted ? [converted] : [];
        }),
      },
    };
  }
  if (value && typeof value === 'object') {
    return {
      kvlistValue: {
        values: attributes(value as Record<string, unknown>),
      },
    };
  }
  return null;
}

function createSpanId() {
  return crypto.randomBytes(8).toString('hex');
}

function unixNano(timeMs: number) {
  return BigInt(Math.round(timeMs * 1_000_000));
}
