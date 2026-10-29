---
"@modelcontextprotocol/server-memory": patch
---

`add_observations` stores an observation repeated within one call once, and reports it once in `addedObservations`, instead of storing it twice.
