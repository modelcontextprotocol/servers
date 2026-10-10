---
"@modelcontextprotocol/server-filesystem": patch
---

A `roots/list_changed` update that leaves no valid root now revokes access once the client's roots are in force, instead of keeping the previous allowed directories, so a client that withdraws its roots withdraws the server's access too (#5094). Every path is then refused with "Access denied - no allowed directories" until the client exposes a root again. Before any root has been in force, such an update still keeps the command-line directories.
