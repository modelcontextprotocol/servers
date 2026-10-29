---
"@modelcontextprotocol/server-everything": patch
---

`trigger-long-running-operation` now honors cancellation in both protocol eras: a cancelled call clears its pending timer and sends no further progress, so it no longer delays stdio shutdown (#1124, #4846).
