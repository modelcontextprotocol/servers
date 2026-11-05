---
"@modelcontextprotocol/server-filesystem": patch
---

A write into a directory that does not exist (`write_file`, `append_file`, `move_file`, `copy_file`) now fails with `Parent directory does not exist: <directory>` instead of a raw `chdir` error that showed the server's working directory. Any other failure to enter a directory names only that directory.
