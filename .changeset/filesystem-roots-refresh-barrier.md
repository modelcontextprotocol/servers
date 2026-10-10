---
"@modelcontextprotocol/server-filesystem": patch
---

Tool calls that arrive while a `roots/list_changed` refresh is fetching the client's roots now wait for it, as they already did for the initial roots, so a call can no longer reach a root the client has just withdrawn while the answer is pending (#5101).
