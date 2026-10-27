---
"@modelcontextprotocol/server-filesystem": patch
---

`move_file` now moves a regular file between allowed directories on different filesystems (mounts, disks or shares), where it used to fail with `EXDEV`: it copies the file to a newly created destination, keeping its permissions and modification time, then removes the source, and removes a partial copy if anything fails. A directory or a symbolic link still cannot be moved across filesystems, and now fails with an error that says so.
