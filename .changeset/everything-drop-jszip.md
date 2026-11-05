---
"@modelcontextprotocol/server-everything": patch
---

Remove the unused `jszip` dependency. Nothing in the server imports it, so installs no longer pull in jszip and its transitive dependencies.
