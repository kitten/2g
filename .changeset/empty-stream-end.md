---
'2g': patch
---

Fix ending an empty log stream before its file opens so it closes and invokes the end callback.
