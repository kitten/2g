---
'2g': patch
---

Settle pending log flushes when their stream closes, reporting an error if shutdown discards buffered data instead of leaving flush callbacks unresolved.
