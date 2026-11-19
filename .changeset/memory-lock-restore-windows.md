---
"@modelcontextprotocol/server-memory": patch
---

Keep the memory file lock exclusive on Windows when a stale-lock break takes a live lock aside by mistake: putting it back is retried while Windows briefly refuses to replace the lock another writer created in the gap, instead of giving up and letting that writer run beside the live lock's holder (#5635).
