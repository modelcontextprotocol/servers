---
"@modelcontextprotocol/server-everything": patch
---

The HTTP+SSE transport no longer prints "Server is running" and stays up when its port is already in use: it reports the port and exits non-zero, as Streamable HTTP does. Streamable HTTP no longer prints its listening line before that error.
