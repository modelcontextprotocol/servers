---
"@modelcontextprotocol/server-filesystem": patch
---

An `excludePatterns` glob ending in `/**`, such as `**/node_modules/**`, now also excludes the directory it names in `search_files` and `directory_tree`. Before, the directory itself was still resolved and read, `search_files` could return it, and `directory_tree` listed it as an empty directory; now the whole subtree is pruned before it is touched.
