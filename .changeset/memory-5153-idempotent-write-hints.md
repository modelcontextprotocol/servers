---
"@modelcontextprotocol/server-memory": patch
---

`create_entities`, `create_relations` and `add_observations` now declare `idempotentHint: true`. Each already skips what is stored, so repeating a call with the same arguments has no additional effect on the graph, as with the delete tools.
