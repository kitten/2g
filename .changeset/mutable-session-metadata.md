---
'2g': minor
---

Add typed, incrementally updated session metadata through `MetadataRegistry`, installation metadata, and `updateEventLoggerMetadata()`. Updates emit `root:metadata`, accumulate in the owning process’s `meta.json`, and appear in `ps` and API listings. Child metadata events are forwarded without parsing or updating the parent’s metadata. Exports retain metadata context when filtering events.

Replace the top-level `version` option and init/session fields with optional `metadata.version`. Update callers to `installEventLogger({ metadata: { version } })`; the `UNVERSIONED` default and legacy version fallback are removed.
