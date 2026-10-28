---
"@modelcontextprotocol/server-filesystem": patch
---

`edit_file`: when an edit's `oldText` matches nowhere, the error now names which edit failed, states the matching rules, and quotes the closest lines of the file with line numbers, plus the first differing line JSON-quoted so a whitespace difference is visible. The tool description now states the matching rules too. What matches is unchanged.
