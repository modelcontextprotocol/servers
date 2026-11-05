---
"@modelcontextprotocol/server-memory": patch
---

The `delete_entities` and `delete_relations` descriptions now say when to use each one and name the other: `delete_entities` removes whole entities with their observations and every relation that touches them, while `delete_relations` removes a link and keeps both entities. `delete_relations` also states that a relation is deleted only on an exact match of `from`, `to` and `relationType`, and points to `open_nodes` for reading the stored type first.
