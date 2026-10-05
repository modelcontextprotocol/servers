---
"@modelcontextprotocol/server-filesystem": patch
---

`edit_file` keeps a file's line endings: a CRLF file is written back with CRLF instead of being converted to LF. When `oldText` has no exact match and the whitespace-tolerant matcher is used, each replacement line now takes the indentation of the file line it replaces, shifted by its indentation relative to the matching `oldText` line, instead of only the first line being reindented.
