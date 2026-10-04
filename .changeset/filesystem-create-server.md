---
"@modelcontextprotocol/server-filesystem": patch
---

Internal: the server is now built by a `createServer()` factory in `server.ts`, and `index.ts` starts it over stdio only when run as the bin, with each server instance holding its own allowed directories. No change to the tools, their results, or how the allowed directories are resolved from arguments and Roots.
