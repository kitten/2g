# 2g

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
