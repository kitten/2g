---
'2g': patch
---

Share an indexed queue between event capture and live tap to drain buffered event bursts without shifting the remaining array on every item. Live tap also uses a single pending callback instead of a waiter array.
