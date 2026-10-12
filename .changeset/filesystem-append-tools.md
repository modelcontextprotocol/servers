---
"@modelcontextprotocol/server-filesystem": minor
---

Add `append_file` for existing files and `create_or_append_file` for creation or append. Append at physical EOF without replacing files, reject missing files for `append_file`, and preserve file identity checks against symlink swaps.
