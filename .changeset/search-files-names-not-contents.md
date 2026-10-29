---
"@modelcontextprotocol/server-filesystem": patch
---

The `search_files` description now says plainly that it finds files and directories by name, not by content, and that its glob is matched case-sensitively against each entry's path relative to `path` (not the working directory), so a model no longer reaches for it to grep file contents.
