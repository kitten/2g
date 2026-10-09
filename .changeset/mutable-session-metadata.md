---
'2g': minor
---

Add typed session metadata and `updateEventLoggerMetadata()` to merge updates, emit `root:update`, and expose current metadata through `ps` and `list()`.

Use `metadata.version` instead of top-level `version` in installation options and session listings. Remove the default version and `formatVersion`; store `format` in `meta.json.metadata`.
