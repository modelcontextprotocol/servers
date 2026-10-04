---
"@modelcontextprotocol/server-memory": patch
---

Build the server with an exported `createServer()` factory and start stdio only when the package is run as a program, so importing the module no longer starts a server. Behavior over stdio is unchanged.
