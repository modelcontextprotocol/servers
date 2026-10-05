---
"@modelcontextprotocol/server-memory": patch
---

Lines in the memory file that the server cannot read (malformed JSON, an entity or relation that fails validation, an unknown record type) are no longer deleted by the next write. They are still left out of the graph, and are now written back unchanged after the graph's own lines.
