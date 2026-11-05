---
"@modelcontextprotocol/server-everything": patch
---

`tasks/update` now measures the answers against its 64 KiB limit in UTF-8 bytes rather than string length, so non-ASCII answers can no longer exceed the byte budget.
