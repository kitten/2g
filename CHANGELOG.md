# 2g

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
