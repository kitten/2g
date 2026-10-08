---
'2g': patch
---

Fix worker initialization events overwriting root session metadata in Chrome Trace and OpenTelemetry exports. Include span start times when calculating the OpenTelemetry session span so it encloses its children.
