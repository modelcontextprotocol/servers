---
"@modelcontextprotocol/server-filesystem": patch
---

Drop the unused `glob` runtime dependency: nothing in the server imported it (pattern matching goes through `minimatch`), so installing the server no longer downloads `glob` and its own dependencies.
