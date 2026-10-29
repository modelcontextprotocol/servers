---
"@modelcontextprotocol/server-memory": patch
---

Warn on stderr at startup when the memory file is inside a `node_modules` directory, where reinstalling or updating the server, or clearing the npx cache, can delete it, and recommend in the README setting `MEMORY_FILE_PATH` to an absolute path you own. The default path is unchanged.
