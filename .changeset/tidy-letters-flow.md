---
'2g': patch
---

Fix Unicode corruption when a partial log write splits a UTF-8 character, including when backpressure switches writes to socket draining
