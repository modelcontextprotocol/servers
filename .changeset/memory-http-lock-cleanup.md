---
"@modelcontextprotocol/server-memory": patch
---

Remove the memory file lock when the server is stopped while serving Streamable HTTP: a write still in flight at shutdown no longer leaves its lock behind for the next writer, and a second SIGINT or SIGTERM exits at once instead of waiting for the listener to close.
