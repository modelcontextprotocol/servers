---
"@modelcontextprotocol/server-memory": patch
---

The `search_nodes` and `open_nodes` tool descriptions now say when to use each one and which sibling read tool to prefer instead, so a model looks an entity up by name with `open_nodes`, searches by keyword with `search_nodes`, and leaves `read_graph` for when it needs the whole graph.
