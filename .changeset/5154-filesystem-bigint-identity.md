---
"@modelcontextprotocol/server-filesystem": patch
---

`write_file` and `edit_file` compare the file they opened against the one they checked as BigInt stats, so a Windows file id above 2^53 is compared exactly rather than rounded. Where a path-based stat on Windows reports no device (libuv < 1.51.0, the Node 23 line), the overwrite no longer refuses every existing file: the file must instead match on inode, size and modification time, and any difference still refuses.
