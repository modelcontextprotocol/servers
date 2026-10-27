---
"@modelcontextprotocol/server-filesystem": minor
---

`get_file_info` now reports a file's hard-link count as a `hardLinks: <n>` line, after `permissions`, so a client can see that a file has other names before changing it. The README now says that allowed-directory checks are path-based, and that overwriting or editing a file that is hard-linked from elsewhere changes it at every name ([#5226](https://github.com/modelcontextprotocol/servers/issues/5226)).
