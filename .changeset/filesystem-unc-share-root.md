---
"@modelcontextprotocol/server-filesystem": patch
---

On Windows, a UNC share root given as an allowed directory (`\\server\share` or `\\server\share\`) now admits the files and subdirectories under it. Before, only the share root itself was accessible and every path below it was refused. Sibling shares such as `\\server\share-evil` are still refused.
