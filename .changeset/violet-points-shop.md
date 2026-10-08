---
'2g': patch
---

Prevent bursts from writing into existing handle when log rotation will trigger, which could lead to a loss of recent log events during a large burst
