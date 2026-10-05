---
"@modelcontextprotocol/server-filesystem": patch
---

`write_file` and `edit_file` now overwrite an existing file in place instead of renaming a temp file over it, so the file keeps its inode, creation time (birthtime), hard links and permission bits (#4512), and an overwrite no longer fails with `EPERM` on Windows when another process holds the file open (#3199). A symlink swapped in after the path was validated is still refused rather than written through, now by an `O_NOFOLLOW` open (on POSIX) and a check that the opened file is the one validated (on every platform). The overwrite is no longer crash-atomic. A read-only file is now refused (`EACCES`, or `EPERM` on Windows) instead of being replaced, since writing in place opens the file itself for writing.
