---
"@modelcontextprotocol/server-filesystem": patch
---

The `list_directory` and `list_directory_with_sizes` descriptions now say when to use each one and name the other: `list_directory` for the names directly inside a path (and `directory_tree` for a recursive view), `list_directory_with_sizes` when sizes matter, sorted by name or by size, largest first, with the totals at the end.
