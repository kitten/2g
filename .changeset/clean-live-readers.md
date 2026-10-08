---
'2g': patch
---

Fix live `tap` sockets, timers, and abort listeners remaining active when iteration stops early. Honor already-aborted signals when following with timeouts.
