---
'2g': patch
---

Clarify logger startup by separating worker metadata setup from parent attachment, keeping target parsing free of state changes, and making child-environment publication and cleanup explicit alongside socket setup.
