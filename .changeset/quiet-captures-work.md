---
'2g': patch
---

Fix empty captures inside instrumented processes by routing the captured child and its descendants to the capture pipe instead of inherited logger IPC
