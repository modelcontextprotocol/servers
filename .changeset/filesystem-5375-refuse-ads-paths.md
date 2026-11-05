---
"@modelcontextprotocol/server-filesystem": patch
---

On Windows, refuse paths that name an NTFS alternate data stream (`file.txt:stream`, `file.txt::$DATA`): a colon anywhere but the drive-letter prefix now fails with "Access denied - NTFS alternate data stream paths are not supported" instead of letting the tools read or write data no directory listing shows. POSIX hosts are unaffected, since a colon is an ordinary character in a file name there. Thanks to @andreiminca, whose #4523 prototyped the check.
