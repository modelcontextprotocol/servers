---
"@modelcontextprotocol/server-filesystem": minor
"@modelcontextprotocol/server-memory": minor
"@modelcontextprotocol/server-sequential-thinking": minor
---

Serve Streamable HTTP as well as stdio (#576). `--transport streamable-http` serves the server on one `/mcp` endpoint, for 2026-07-28 and 2025-era clients alike, at `HOST`:`PORT` (`127.0.0.1:3001` by default); stdio stays the default. Over HTTP the filesystem server requires its allowed directories on the command line, since it cannot ask a client for its Roots, and the sequential-thinking history belongs to the server process rather than to one connection.
