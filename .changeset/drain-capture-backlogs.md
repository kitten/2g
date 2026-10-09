---
'2g': patch
---

Drain captured event backlogs with an advancing queue index instead of shifting the remaining array on every event. Release consumed event references immediately and periodically compact the queue.
