---
"@modelcontextprotocol/server-filesystem": minor
---

Expose files in the allowed directories as MCP resources through a `file://{+path}` resource template, so a client can read a file with `resources/read` (text or a base64 blob by MIME type), confined to the allowed directories exactly as the tools are. `resources/list` stays empty, so the server never enumerates the disk.
