---
"@modelcontextprotocol/server-everything": patch
---

Internal refactor for in-process testing, with no change in behavior: the launcher only starts a transport when run as the binary, and the stdio, SSE and Streamable HTTP transport modules export their start-up (`startStdioServer`, `startSseServer`, `startStreamableHttpServer`, and `createApp()` for the HTTP transports) instead of starting a server when imported.
