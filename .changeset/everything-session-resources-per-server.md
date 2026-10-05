---
"@modelcontextprotocol/server-everything": patch
---

Session resources are now tracked per server, so two sessions that create a session resource with the same name (for example via `gzip-file-as-resource`) no longer evict each other's resource (#4808).
