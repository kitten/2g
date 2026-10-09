# 2g

## 1.0.0

### Major Changes

- Bump to 1.0.0 (stable)
  Submitted by [@kitten](https://github.com/kitten) (See [`c6d52b9`](https://github.com/kitten/2g/commit/c6d52b937a30b3dae167f40b6820ba3e84329287))

### Minor Changes

- Add typed session metadata and `updateEventLoggerMetadata()` to merge updates, emit `root:update`, and expose current metadata through `ps` and `list()`.
  Use `metadata.version` instead of top-level `version` in installation options and session listings. Remove the default version and `formatVersion`; store `format` in `meta.json.metadata`
  Submitted by [@kitten](https://github.com/kitten) (See [#34](https://github.com/kitten/2g/pull/34))

### Patch Changes

- Improve core LogStream throughput by queuing complete lines in a chunk as one block while retaining partial tails
  Submitted by [@kitten](https://github.com/kitten) (See [#49](https://github.com/kitten/2g/pull/49))
- Stop delivering buffered live tap events after cancellation, including when the abort signal fires during history replay or between buffered events
  Submitted by [@kitten](https://github.com/kitten) (See [#53](https://github.com/kitten/2g/pull/53))
- Simplify session discovery by retaining newest entries directly and checking process liveness only once per distinct PID
  Submitted by [@kitten](https://github.com/kitten) (See [#48](https://github.com/kitten/2g/pull/48))
- ⚠️ Fix live `tap` sockets, timers, and abort listeners remaining active when iteration stops early. Honor already-aborted signals when following with timeouts
  Submitted by [@kitten](https://github.com/kitten) (See [#26](https://github.com/kitten/2g/pull/26))
- Clarify logger startup by separating worker metadata setup from parent attachment, keeping target parsing free of state changes, and making child-environment publication and cleanup explicit alongside socket setup
  Submitted by [@kitten](https://github.com/kitten) (See [#32](https://github.com/kitten/2g/pull/32))
- Reduce Chrome trace export allocations and map lookups by grouping spans as they arrive, retaining track references, and deriving lane IDs from each track's first thread ID
  Submitted by [@kitten](https://github.com/kitten) (See [#43](https://github.com/kitten/2g/pull/43))
- ⚠️ Fix worker initialization events overwriting root session metadata in Chrome Trace and OpenTelemetry exports. Include span start times when calculating the OpenTelemetry session span so it encloses its children
  Submitted by [@kitten](https://github.com/kitten) (See [#28](https://github.com/kitten/2g/pull/28))
- Avoid copying Buffer and Uint8Array input before decoding it in LogStream.write()
  Submitted by [@kitten](https://github.com/kitten) (See [#50](https://github.com/kitten/2g/pull/50))
- Improve OpenTelemetry export throughput by building event attributes directly and avoiding temporary arrays when converting array payloads
  Submitted by [@kitten](https://github.com/kitten) (See [#47](https://github.com/kitten/2g/pull/47))
- Drain captured event backlogs with an advancing queue index instead of shifting the remaining array on every event. Release consumed event references immediately and periodically compact the queue
  Submitted by [@kitten](https://github.com/kitten) (See [#44](https://github.com/kitten/2g/pull/44))
- Share an indexed queue between event capture and live tap to drain buffered event bursts without shifting the remaining array on every item. Live tap also uses a single pending callback instead of a waiter array
  Submitted by [@kitten](https://github.com/kitten) (See [#45](https://github.com/kitten/2g/pull/45))
- ⚠️ Fix ending an empty log stream before its file opens so it closes and invokes the end callback
  Submitted by [@kitten](https://github.com/kitten) (See [#37](https://github.com/kitten/2g/pull/37))
- ⚠️ Fix explicit `LOG_EVENTS` file and fd destinations ignoring the version supplied to `installEventLogger` when emitting `root:init`
  Submitted by [@kitten](https://github.com/kitten) (See [#30](https://github.com/kitten/2g/pull/30))
- ⚠️ Fix `record` reporting success when the recorded command exits with a nonzero status, while still writing its trace
  Submitted by [@kitten](https://github.com/kitten) (See [#23](https://github.com/kitten/2g/pull/23))
- Group Chrome trace spans by track in one pass to avoid scanning every event for each track during lane assignment
  Submitted by [@kitten](https://github.com/kitten) (See [#40](https://github.com/kitten/2g/pull/40))
- ⚠️ Fix missing worker IDs on ordinary child-process events when the parent logs to an explicit file or file descriptor
  Submitted by [@kitten](https://github.com/kitten) (See [#25](https://github.com/kitten/2g/pull/25))
- ⚠️ Fix empty captures inside instrumented processes by routing the captured child and its descendants to the capture pipe instead of inherited logger IPC
  Submitted by [@kitten](https://github.com/kitten) (See [#24](https://github.com/kitten/2g/pull/24))
- ⚠️ Fix typegen emitting invalid declarations for payload property names containing punctuation, quotes, backslashes, or newlines by quoting and escaping property names
  Submitted by [@kitten](https://github.com/kitten) (See [#29](https://github.com/kitten/2g/pull/29))
- Preserve application version metadata when filtering `record` exports
  Submitted by [@kitten](https://github.com/kitten) (See [#36](https://github.com/kitten/2g/pull/36))
- ⚠️ Fix `record` reporting success when the recorded command is terminated by a signal, while still writing its trace
  Submitted by [@kitten](https://github.com/kitten) (See [#35](https://github.com/kitten/2g/pull/35))
- Release consumed log queue strings promptly and periodically compact the queue so sustained backlogs and partial lines do not retain previously written data
  Submitted by [@kitten](https://github.com/kitten) (See [#41](https://github.com/kitten/2g/pull/41))
- Reuse converted OpenTelemetry timestamps for session bounds and exported events, avoiding repeated string and BigInt conversions
  Submitted by [@kitten](https://github.com/kitten) (See [#42](https://github.com/kitten/2g/pull/42))
- Reuse the event serializer for completed spans to reduce core bundle size
  Submitted by [@kitten](https://github.com/kitten) (See [#49](https://github.com/kitten/2g/pull/49))
- Check literal event categories and names against the nonempty ASCII identifier convention: letters, digits, `_`, `-`, `.`, or `:`. Typegen rejects invalid registered names. Dynamic strings remain the caller's responsibility; event serialization is unchanged
  Submitted by [@kitten](https://github.com/kitten) (See [#27](https://github.com/kitten/2g/pull/27))
- Separate shared session metadata and discovery helpers from retention cleanup, and move session listing and selection out of event reading so the CLI and public API use a focused sessions module
  Submitted by [@kitten](https://github.com/kitten) (See [#33](https://github.com/kitten/2g/pull/33))
- Move the hardcoded session `format` to the top level of `meta.json` and remove it from application metadata types. Keep the application `version` in metadata
  Submitted by [@kitten](https://github.com/kitten) (See [#36](https://github.com/kitten/2g/pull/36))
- Settle pending log flushes when their stream closes, reporting an error if shutdown discards buffered data instead of leaving flush callbacks unresolved
  Submitted by [@kitten](https://github.com/kitten) (See [#53](https://github.com/kitten/2g/pull/53))
- Share event-name helpers between trace exporters and removing redundant debug-sink filtering
  Submitted by [@kitten](https://github.com/kitten) (See [#46](https://github.com/kitten/2g/pull/46))
- Share the path and error helper functions between event loggers to avoid allocating them for every events() call
  Submitted by [@kitten](https://github.com/kitten) (See [#51](https://github.com/kitten/2g/pull/51))
- Reuse one session discovery snapshot for listing and retention cleanup, avoiding repeated directory reads, metadata reads, and PID checks
  Submitted by [@kitten](https://github.com/kitten) (See [#38](https://github.com/kitten/2g/pull/38))
- Simplify span serialization by removing unused payload merging
  Submitted by [@kitten](https://github.com/kitten) (See [#39](https://github.com/kitten/2g/pull/39))
- Reuse log batch buffers to reduce allocation and encoding overhead, improving sustained Unicode logging throughput
  Submitted by [@kitten](https://github.com/kitten) (See [#22](https://github.com/kitten/2g/pull/22))
- ⚠️ Fix Unicode corruption when a partial log write splits a UTF-8 character, including when backpressure switches writes to socket draining
  Submitted by [@kitten](https://github.com/kitten) (See [#22](https://github.com/kitten/2g/pull/22))
- Prevent bursts from writing into existing handle when log rotation will trigger, which could lead to a loss of recent log events during a large burst
  Submitted by [@kitten](https://github.com/kitten) (See [#20](https://github.com/kitten/2g/pull/20))
- Add missing try-catch for failing log rotation
  Submitted by [@kitten](https://github.com/kitten) (See [#52](https://github.com/kitten/2g/pull/52))

## 0.4.4

### Patch Changes

- Update `record` help output to mention `LOG_EVENTS` for raw debug output
  Submitted by [@kitten](https://github.com/kitten) (See [#18](https://github.com/kitten/2g/pull/18))

## 0.4.3

### Patch Changes

- ⚠️ Fix IPC for child process/worker threads not activating for explicit log targets, for example on `record`
  Submitted by [@kitten](https://github.com/kitten) (See [#16](https://github.com/kitten/2g/pull/16))

## 0.4.2

### Patch Changes

- Clarify `--debug` and `LOG_DEBUG` even more clearly
  Submitted by [@kitten](https://github.com/kitten) (See [#14](https://github.com/kitten/2g/pull/14))

## 0.4.1

### Patch Changes

- ⚠️ Fix drain on SIGINT/SIGTERM on `2g record`
  Submitted by [@kitten](https://github.com/kitten) (See [#12](https://github.com/kitten/2g/pull/12))

## 0.4.0

### Minor Changes

- Add new `record -- [command]` sub-command to export traces for full command runs
  Submitted by [@kitten](https://github.com/kitten) (See [#10](https://github.com/kitten/2g/pull/10))

### Patch Changes

- Adjust help output and limits to prevent agents from running into cut-off trace outputs/logs
  Submitted by [@kitten](https://github.com/kitten) (See [#10](https://github.com/kitten/2g/pull/10))

## 0.3.1

### Patch Changes

- ⚠️ Fix missing child `_w` IDs on piped events and auto-install in child workers
  Submitted by [@kitten](https://github.com/kitten) (See [#8](https://github.com/kitten/2g/pull/8))

## 0.3.0

### Minor Changes

- Make initial `log.span` call not accept arguments, to prevent merging and split event construction
  Submitted by [@kitten](https://github.com/kitten) (See [#7](https://github.com/kitten/2g/pull/7))

### Patch Changes

- Assign unique ID to child process threads
  Submitted by [@kitten](https://github.com/kitten) (See [#5](https://github.com/kitten/2g/pull/5))
- Improve help docs for debugging
  Submitted by [@kitten](https://github.com/kitten) (See [#4](https://github.com/kitten/2g/pull/4))

## 0.2.0

### Minor Changes

- Loosen event filter grammar for more intuitive filtering (e.g. raw event name scopes to any sub-filter too, instead of exact matches)
  Submitted by [@kitten](https://github.com/kitten) (See [#1](https://github.com/kitten/2g/pull/1))

### Patch Changes

- Adjust `--help` output for agent usage
  Submitted by [@kitten](https://github.com/kitten) (See [#3](https://github.com/kitten/2g/pull/3))

## 0.1.0

Initial Release.
