---
"@modelcontextprotocol/server-memory": patch
---

Two server processes sharing one memory file no longer silently discard each other's writes: every write tool now holds an exclusive lock file (`<memory file>.lock`) while it reads, changes and saves the graph, and a lock left by a crashed server is recovered automatically (#4797).
