---
"@modelcontextprotocol/server-filesystem": patch
"@modelcontextprotocol/server-memory": patch
"@modelcontextprotocol/server-everything": patch
---

Describe every tool input property in tools/list (#3669). Every filesystem path argument now says how it is resolved and that it must stay inside the allowed directories, and `excludePatterns` says how its globs match (which differs between `directory_tree` and `search_files`). The memory server's top-level array arguments, and the everything server's `resourceType`, gain descriptions, and `get-resource-reference`'s `resourceId` no longer claims to fetch only text resources.
