---
"@modelcontextprotocol/server-memory": patch
---

Remove the memory file lock the server holds when it is stopped by SIGINT or SIGTERM, or exits, so the next writer does not wait for it to go stale.
