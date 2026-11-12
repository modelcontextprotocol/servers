---
"@modelcontextprotocol/server-memory": minor
---

Add opt-in write limits: `MEMORY_MAX_ENTITIES`, `MEMORY_MAX_RELATIONS` and `MEMORY_MAX_FILE_BYTES` cap how large the write tools may grow the graph, and the README now documents that every write rewrites the whole memory file.
