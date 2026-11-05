---
"@modelcontextprotocol/server-filesystem": patch
---

On Windows, refuse paths with a component that is a reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`, in any case and with or without an extension) or that ends in a dot or a space (`file.txt.`, `file.txt `), with "Access denied - Windows reserved device names ... are not supported" or "Access denied - Windows path components ending in a dot or a space are not supported". Windows opens the device instead of a file in the allowed directory, and strips trailing dots and spaces so the name refers to a different file. `.` and `..` components are not affected, and POSIX hosts are unaffected.
