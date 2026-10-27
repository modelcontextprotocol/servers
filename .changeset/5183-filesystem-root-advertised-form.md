---
"@modelcontextprotocol/server-filesystem": patch
---

A client Root is now allowed in the form the client advertised it as well as in its resolved form, as command-line directories already were. A request that names a path through a symlinked Root's own spelling (for example `/tmp/...` for a Root of `file:///tmp/...` on macOS) is no longer refused, and `list_allowed_directories` lists both forms. Every request is still resolved and checked against the resolved directory, so a symlink inside a Root that points outside it stays refused.
