---
"@modelcontextprotocol/server-filesystem": patch
---

Expand `~\` to the home directory on Windows, in command-line directories, request paths and client Roots alike, as `~/` already is. On POSIX a backslash is a filename character, so `~\name` there still names a literal file.
