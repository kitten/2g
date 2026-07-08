<div align="center">
  <h2>2g</h2>
  <strong>Low-overhead structured event logs for agents and developers</strong>
  <br />
  <br />
</div>

`2g` is a structured event logger for command-line tools. It writes JSONL logs
that can be replayed, tailed, or exported to trace formats.

In short, `2g`,

- keeps logging cheap enough to leave enabled
- writes bounded session logs to the system temporary directory
- forwards worker and child-process events into the same session
- lets tools and agents tap into running commands
- derives typed event payloads through TypeScript declaration merging

## Implementation

The goal of `2g` is to replace ad-hoc `debug` logging with structured events
that are always recorded, without instrumented code paths paying for it. A disabled logging
call is a single property check, and an enabled call serializes straight into a batched
file stream — there is no interchange format, no transport negotiation, and no
per-event allocation beyond the payload the caller already builds.

This has been built with the explicit purpose in mind to:

- Instrument CLI processes that spawn workers and child processes, unifying their events
  into one session log
- Keep a bounded, self-cleaning record of recent sessions that tooling and agents can
  discover and replay after the fact
- Tap into live processes without those processes knowing or slowing down

As such, sessions write newline-framed JSONL through a single batched fd writer, rotate
across fixed-size segments, and broadcast to live subscribers over a local socket. Child
processes and workers inherit the session over an IPC socket published through the
environment, so the whole process tree agrees on one destination.

The package ships two entrypoints so consumers don't load the producer graph and vice
versa:

- `2g` — the producer surface instrumented processes import
- `2g/api` — the consumption surface for tooling that reads sessions

## Quick start

Install logging once when a CLI command starts, then create loggers in any package:

```ts
import { installEventLogger, events } from '2g';

installEventLogger({ command: 'expo start -p web', version: '1.0.0' });

const log = events('metro');

log('ready', { port: 8081 });

const end = log.span('bundle', { platform: 'ios' });
end('bundle', { cached: false });
```

Tap into the session from another terminal:

```sh
2g tap "expo start" --filter metro:* --tail
```

## Behavior

### Activation

`installEventLogger` resolves its destination in precedence order:

1. An explicit `LOG_EVENTS` target — an fd number or a file path, from the environment or
   passed directly
2. A parent 2g process, inherited through the environment; events forward into the
   parent's session over IPC
3. A session in the system temporary directory, when an options object is passed
4. Otherwise logging stays inactive and all calls are no-ops

Calling `installEventLogger()` with no arguments activates logging only when `LOG_EVENTS`
or a parent process is present — the right idiom for child processes, workers, and
libraries. Passing `session: false` keeps this env-only activation while still providing
options. There is no uninstall: logging is installed once per process and torn down on
exit.

When `LOG_EVENTS` targets stdout, `console` is transparently redirected to stderr so
event output stays machine-readable.

### Sessions

Sessions live under `event-log-<uid>` in the system temporary directory. Each
session directory holds rotating JSONL segments (`0.jsonl` is current), a `meta.json`
describing the process, and local sockets for live subscribers and child IPC. With the
defaults of 3 segments × 512 KiB, a session retains roughly the last 12k events.

Stale sessions are cleaned opportunistically: exited sessions are removed after 7 days,
and only the newest 100 exited sessions are kept. An unwritable temporary directory
disables session capture without affecting the host process.

### Debug events

`events.debug(category)` creates a logger for chatty, debug-level events. Debug events
carry `_l: 1` on the wire. Session output drops them at the emit site — keeping the
rotation budget for normal history — unless `LOG_DEBUG` is set or `installEventLogger`
is passed `debug: true`; explicit `LOG_EVENTS` targets record them. `tap` and `export`
skip debug events unless `--debug` (CLI) or `debug: true` (API) is passed.

`LOG_DEBUG` also prints matching events to stderr in a readable format while structured
logging continues unchanged:

```sh
LOG_DEBUG=metro:* expo start
LOG_DEBUG=* expo export
```

### Deferred payload helpers

`log.path(absolutePath)` logs paths relative to the log target, and `log.error(error)`
serializes an error to `{ name, message, code, stack, cause }`. Both return
`Serialized<T>` wrappers — `{ toJSON(): T }` — that only do their work when an event is
written, so disabled loggers skip `path.relative` calls and `error.stack`
materialization entirely. Payloads accept `Serialized<T>` wherever their declared types
expect `T`, so `EventRegistry` declarations keep using the wire shapes.

### Typed events

Extend `EventRegistry` to type event payloads; keys are `category:kind` and payloads
merge across packages through declaration merging:

```ts
declare module '2g' {
  interface EventRegistry {
    'metro:ready': { port: number };
    'metro:bundle': { platform?: string; cached?: boolean };
  }
}
```

Unknown event names are uncallable, reserved wire fields (`_e`, `_t`, `_d`, `_l`, `_w`)
are rejected in payload types, and payloads with no required keys become optional
arguments. `2g typegen` merges the registry declarations of a whole project into
one schema.

## CLI

Use the CLI to find sessions, replay logs, or export traces:

```sh
2g ps --json
2g tap "expo start" --filter metro:* --tail
2g export "expo start" --format chrome-trace -o trace.json
2g export "expo start" --format opentelemetry -o otel.json
2g typegen --project tsconfig.json --format dts
2g clean --json
```

Selectors match a session by PID, command, session directory, or working directory.
`--filter` patterns are event-name prefixes matched on whole segments — `metro:bundling`
matches `metro:bundling` and `metro:bundling:started`, but not `metro:bundling2` — and a
`*` matches anything, even across segments. `tap` and `export` replay retained history
first. `--tail` appends live events; an event written in the instant `--tail` attaches
may appear twice at the seam.

Open Chrome traces in [ui.perfetto.dev](https://ui.perfetto.dev) or via Chrome DevTools →
Performance → "Load profile" (renders as a plain flame chart); `chrome://tracing` is
deprecated. For a near-live view of a running command, tail the export:

```sh
2g export "expo start" --tail -o trace.json
```

## Testing

Capture a subprocess's events in integration tests by handing it a pipe as its
`LOG_EVENTS` target:

```ts
import { spawn } from 'node:child_process';
import { captureEvents } from '2g/api';

const capture = captureEvents({ filter: 'metro:*' });
const child = spawn(
  'expo',
  ['export'],
  capture.spawnOptions({ env: process.env })
);

const events = await capture.attach(child).collect();
```

`spawnOptions` appends a pipe to `stdio` and points `LOG_EVENTS` at it; `attach`
consumes the pipe and parses events, and can also be iterated with `for await` for live
consumption. Iteration ends when the pipe closes, so every event the child wrote is
received.

> [!IMPORTANT]
> The child's events are flushed on natural exit. Child code that calls `process.exit()`
> should `await flushEventLogger()` first or trailing events may be lost.

## API Reference

### `2g`

The producer entry that instrumented processes import.

#### `events(category: string) => EventLogger`

Returns a typed logger for `category`. The logger is callable directly and carries
helpers:

- `log(event, data?)`: writes a `category:event` line with the payload
- `log.span(event, data?)`: starts a span; returns an `end(event, data?)` function that
  writes a single event carrying the duration as `_d`
- `log.path(target)`: returns a `Serialized<string>` of the path relative to the log
  target
- `log.error(error)`: returns a `Serialized<SerializedError>` of
  `{ name, message, code, stack, cause }`, with cause chains serialized recursively
- `log.category`: the category string

Span kinds ending in `:started`, `:done`, or `:failed` are naming conventions; trace
exporters strip the suffix from displayed names.

#### `events.debug(category: string) => EventLogger`

Identical to `events(category)`, but events are debug-level (`_l: 1`) and subject to
debug gating.

#### `installEventLogger(target?: string | number | InstallEventLoggerOptions) => void`

- Accepts an explicit target (fd number or file path) or an options object

Installs logging for the process following the activation precedence above. All options
are optional:

| Option           | Default | Description                                                                                                       |
| ---------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `command`        | argv    | Command line recorded in session metadata                                                                         |
| `version`        | —       | Tool version recorded in session metadata and the init event                                                      |
| `maxSegments`    | `3`     | Rotated JSONL segments kept per session                                                                           |
| `maxSegmentSize` | 512 KiB | Segment size that triggers rotation                                                                               |
| `session`        | `true`  | Allow the session fall-through; `false` keeps env-only activation                                                 |
| `debug`          | varies  | Record debug events; defaults to `true` on explicit targets and to `LOG_DEBUG` presence on session and IPC output |

#### `flushEventLogger() => Promise<void>`

Drains buffered events to the active destination. Resolves immediately when logging is
inactive.

#### `getEventLoggerInfo() => EventLoggerInfo | null`

Returns the active destination — `{ destination, isUserVisibleOutput }` plus a `file`,
`fd`, or `sessionDir` — or `null` when logging is inactive. `isUserVisibleOutput` is
`true` when events write to stdout or stderr.

#### `interface Serialized<T>`

```ts
interface Serialized<T> {
  toJSON(): T;
}
```

A deferred value that serializes to `T` when an event is written. Payload types accept
`Serialized<T>` wherever `T` is declared, so user code can defer its own expensive
values the same way.

### `2g/api`

The consumption entry for tooling that reads sessions.

#### `list(options?: ListSessionsOptions) => Promise<ListedSession[]>`

- **Parameters**
  - `selector?`: matches by PID, command, session directory, or working directory

Returns known sessions, newest first. Each `ListedSession` carries `pid`, `command`,
`cwd`, `startedAt`, `alive`, and `sessionDir`.

#### `resolveSession(selector?: string) => Promise<ListedSession>`

Resolves a selector to exactly one session, preferring the only alive match. Throws when
nothing matches or the selector is ambiguous.

#### `tap(sessionDir: string, options?: TapOptions) => AsyncIterable<ParsedEvent>`

Replays a session's retained history and optionally follows live events.

| Option        | Default | Description                                                          |
| ------------- | ------- | -------------------------------------------------------------------- |
| `since`       | —       | Replay from a duration (`'5m'`), Unix time, ISO date, or `Date`      |
| `follow`      | `false` | Follow live events after replaying history                           |
| `filter`      | —       | Event-name prefixes (whole segments); `*` wildcards, comma-separated |
| `spans`       | `false` | Only yield events carrying a span duration                           |
| `debug`       | `false` | Include debug-level events                                           |
| `signal`      | —       | `AbortSignal` that stops following                                   |
| `timeout`     | —       | Stop following after an absolute duration in milliseconds            |
| `idleTimeout` | —       | Stop following after this many milliseconds without a new event      |

#### `captureEvents(options?: CaptureOptions) => EventCapture`

- **Parameters**
  - `filter?` and `debug?`: as in `TapOptions`

Returns an `EventCapture` for receiving a subprocess's events over an inherited pipe:

- `capture.spawnOptions(options?)`: returns spawn options with a `'pipe'` slot appended
  to `stdio` and `LOG_EVENTS` pointing at it, preserving the caller's `env` and `stdio`
- `capture.attach(child)`: consumes the child's pipe; the capture is an
  `AsyncIterable<ParsedEvent>` that ends when the pipe closes
- `capture.collect()`: iterates to the end and returns all events

#### `interface ParsedEvent`

The wire format of a parsed JSONL event; all other properties are payload fields.

```ts
interface ParsedEvent {
  _e: string; // "category:kind"
  _t: number; // wall-clock timestamp in milliseconds
  _d?: number; // span duration in milliseconds
  _l?: number; // level; 1 marks debug events
  _w?: string; // originating worker or child process
}
```
