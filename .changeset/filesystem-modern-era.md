---
"@modelcontextprotocol/server-filesystem": minor
---

Serve the 2026-07-28 protocol revision alongside the 2025 era on stdio, through the SDK's `serveStdio` entry (#4852). A 2026-07-28 connection has no `initialize` and no server-to-client `roots/list`, and Roots is deprecated as of that revision, so the command-line directories are its whole allow-list; a server started with none answers each tool call on such a connection with an error saying so. 2025-era clients keep the Roots behavior they had. The README now recommends command-line directories over Roots (#4844).
