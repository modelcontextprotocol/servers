---
"@modelcontextprotocol/server-filesystem": patch
---

`move_file` now refuses to move a directory into itself with `Cannot move a directory into itself: <destination> is inside <source>`, instead of reporting `Parent directory does not exist` for a destination directory that does exist.
