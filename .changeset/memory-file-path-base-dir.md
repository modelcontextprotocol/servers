---
"@modelcontextprotocol/server-memory": patch
---

Internal: `ensureMemoryFilePath` accepts the directory its default files live in, so the server's tests no longer write into the package directory. No change to how the server chooses or migrates its memory file.
