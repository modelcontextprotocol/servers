---
"@modelcontextprotocol/server-memory": minor
---

Add optional lightweight read modes, so a large graph need not be returned whole: `observationLimit` on `read_graph`, `search_nodes` and `open_nodes` caps the observations returned per entity and adds each entity's total as `observationCount` (`0` gives an overview of names, types and counts), `entityTypes` on `read_graph` keeps only entities of those types, and `limit` on `search_nodes` caps the number of matches. Calls without them return what they always have. The `read_graph` description now says when to use it rather than `search_nodes` or `open_nodes`.
