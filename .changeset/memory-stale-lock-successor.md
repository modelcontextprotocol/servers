---
"@modelcontextprotocol/server-memory": patch
---

Stop a server breaking a stale memory file lock from deleting a live lock that replaced it in the meantime, which let two writers change the memory file at once and lose a write. The stale lock is now moved aside, checked to be the file that was judged stale, and only then deleted.
