type Prettify<T> =
  T extends Record<string, unknown> ? { [K in keyof T]: T[K] } : T;

type Letters<S extends string> = S extends `${infer First}${infer Rest}`
  ? First | Letters<Rest>
  : never;
type NameCharacter =
  | Letters<'abcdefghijklmnopqrstuvwxyz0123456789_.:-'>
  | Uppercase<Letters<'abcdefghijklmnopqrstuvwxyz'>>;
type SafeCharacters<S extends string> = string extends S
  ? true
  : S extends ''
    ? true
    : S extends `${NameCharacter}${infer Rest}`
      ? SafeCharacters<Rest>
      : false;

export type ValidEventName<Name extends string> = Name extends ''
  ? never
  : SafeCharacters<Name> extends true
    ? Name
    : never;

type ReservedPayloadKeys = '_e' | '_t' | '_d' | '_l' | '_w';

type ValidPayload<Payload> =
  Extract<keyof Payload, ReservedPayloadKeys> extends never
    ? Prettify<Payload>
    : never;

export interface MetadataRegistry {
  version?: string;
}

type JsonMetadata<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends (...args: any[]) => any
    ? never
    : T extends object
      ? { [K in keyof T]: JsonMetadata<T[K]> }
      : never;

export type EventLoggerMetadata = {
  [K in Exclude<keyof MetadataRegistry, ReservedPayloadKeys>]?: JsonMetadata<
    MetadataRegistry[K]
  >;
};

export interface EventRegistry {
  [key: `custom:${string}`]: Record<string, unknown>;
  'root:metadata': { metadata: EventLoggerMetadata };
  'root:init': {
    format: 'v0-jsonl' | (string & {});
    formatVersion: number;
    metadata?: EventLoggerMetadata;
  };
}

export type EventKeys = Extract<keyof EventRegistry, string>;

export type EventByKey<Key extends EventKeys> = Prettify<
  { key: Key } & EventRegistry[Key]
>;

export type AllEvents = {
  [K in EventKeys]: EventByKey<K>;
}[EventKeys];

export type EventNamesFor<Category extends string> = EventKeys extends infer K
  ? K extends `${Category}:${infer Name}`
    ? Name
    : never
  : never;

export type EventPayload<
  Category extends string,
  Name extends string,
> = `${Category}:${Name}` extends EventKeys
  ? ValidPayload<EventRegistry[`${Category}:${Name}`]>
  : never;

export interface Serialized<T> {
  toJSON(): T;
}

type SerializablePayload<Payload> = {
  [K in keyof Payload]: Payload[K] | Serialized<Payload[K]>;
};

// The [never] guard keeps unknown event names uncallable; payloads with no
// required keys become optional.
type PayloadArgs<Payload> = [Payload] extends [never]
  ? [data: never]
  : Partial<Payload> extends Payload
    ? [data?: SerializablePayload<Payload>]
    : [data: SerializablePayload<Payload>];

export interface SpanEnd<Category extends string> {
  <Name extends EventNamesFor<Category>>(
    event: Name & ValidEventName<Name>,
    ...args: PayloadArgs<EventPayload<Category, Name>>
  ): void;
}

export interface SerializedError {
  name: string;
  message: string;
  code?: string;
  stack?: string;
  cause?: SerializedError | string;
}

export interface EventLogger<Category extends string> {
  <Name extends EventNamesFor<Category>>(
    event: Name & ValidEventName<Name>,
    ...args: PayloadArgs<EventPayload<Category, Name>>
  ): void;
  span(): SpanEnd<Category>;
  path(target: string): Serialized<string>;
  path(target: string | null | undefined): Serialized<string | null>;
  error(error: Error): Serialized<SerializedError>;
  error(error: unknown): Serialized<SerializedError | string | null>;
  readonly category: Category;
}

export interface ParsedEvent {
  _e: string;
  _t: number;
  _d?: number;
  _l?: number;
  _w?: string;
  [key: string]: unknown;
}
