---
"@modelcontextprotocol/server-sequential-thinking": patch
---

Build the server with an exported `createServer()` factory and attach stdio only when `index.js` runs as the binary, so the server can be tested in-process. No change to the tool, its schemas or its results.
