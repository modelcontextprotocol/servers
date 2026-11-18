---
"@modelcontextprotocol/server-filesystem": patch
---

On Windows, `list_directory`, `list_directory_with_sizes`, `directory_tree` and `search_files` now check the directory they list before and after reading it: its path must have no junction or symlink on it and must name the same directory both times, or the call is refused with "Access denied - a directory on the path changed during the operation". A directory swapped for a junction after the path was validated is no longer listed. A swap made and undone while the directory is being read is still not detected; the README's "Limit on Windows" entry says what holds. macOS and Linux are unchanged.
