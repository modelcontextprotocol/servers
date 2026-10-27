---
"@modelcontextprotocol/server-memory": patch
---

A failed `memory.json` to `memory.jsonl` migration now stops startup with an error naming both paths and the cause, instead of being silently ignored and starting the server on an empty graph.
