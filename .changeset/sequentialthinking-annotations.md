---
"@modelcontextprotocol/server-sequential-thinking": patch
---

Advertise the `sequentialthinking` tool as `readOnlyHint: false` and `idempotentHint: false`. Every call appends to the server's thought history and branch map, so the tool was never read-only or idempotent. `destructiveHint` and `openWorldHint` stay `false`. (#4721)
