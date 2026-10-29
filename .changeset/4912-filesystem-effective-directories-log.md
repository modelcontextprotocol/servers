---
"@modelcontextprotocol/server-filesystem": patch
---

Log the effective allowed directories to stderr, with their source, at startup and whenever they change: from the command line, or from the client's Roots (saying whether those replaced the command-line directories), or none, with why every path is now refused. Previously the server logged only a count of valid Roots.
