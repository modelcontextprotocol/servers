---
"@modelcontextprotocol/server-filesystem": patch
---

`search_files` now reads `excludePatterns` the same way `directory_tree` does: a bare name such as `"node_modules"` excludes an entry of that name at any depth and the whole subtree below it, instead of only one directly under the searched path. Wildcard patterns keep their meaning, and an excluded directory is still never resolved or read. Thanks to @xubenqiang for the prototype fix.
