---
"@modelcontextprotocol/server-filesystem": patch
---

Overlapping roots refreshes now take effect in the order they started: when a client sends `roots/list_changed` again before the previous `roots/list` answer arrived (or while the initial roots are still loading), an answer that arrives after a newer refresh has started is discarded instead of overwriting it, so a stale answer can no longer undo a newer update such as a revocation (#5097).
