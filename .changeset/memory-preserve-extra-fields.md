---
"@modelcontextprotocol/server-memory": patch
---

Keep the fields the server does not model on stored entities and relations (a `createdAt` written by an older version or another client, say) when a write saves the graph. Before, every write dropped them from the memory file, even an empty `create_entities` call, so `create_entities`, `create_relations` and `add_observations` destroyed data despite declaring `destructiveHint: false`. A record a delete tool removes still goes with its fields, and the fields never appear in tool results.
