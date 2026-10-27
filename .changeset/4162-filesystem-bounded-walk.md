---
"@modelcontextprotocol/server-filesystem": patch
---

`search_files`, `directory_tree` and path validation no longer hang on slow provider-backed folders (macOS CloudStorage, iCloud Drive, slow network mounts). Each `realpath` and recursive `readdir` now waits at most 15 seconds and then fails the request with an error naming the path; a path whose realpath times out is refused. `search_files` and `directory_tree` stop with an error after visiting 100,000 entries. `search_files` now applies `excludePatterns` before resolving an entry, so an excluded folder is never touched.
