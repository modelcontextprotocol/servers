---
"@modelcontextprotocol/server-memory": patch
---

Fix the file lock's heartbeat refreshing a lock file this process no longer owns: once a lock is broken as stale and re-taken by another process, the previous holder stops refreshing it, so a crashed new owner's lock can still go stale and be broken.
