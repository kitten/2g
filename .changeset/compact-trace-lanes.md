---
'2g': patch
---

Reduce Chrome trace export allocations and map lookups by grouping spans as they arrive, retaining track references, and deriving lane IDs from each track's first thread ID.
