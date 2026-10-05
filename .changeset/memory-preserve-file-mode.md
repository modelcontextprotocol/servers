---
"@modelcontextprotocol/server-memory": patch
---

Saving the knowledge graph keeps the memory file's permission bits (an operator's `0600` no longer comes back `0644`), and a write to a read-only memory file now fails with `EACCES` instead of silently replacing it (#4827).
