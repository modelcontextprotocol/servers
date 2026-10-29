---
"@modelcontextprotocol/server-sequential-thinking": minor
---

Bound the thought history each connection keeps: at most `MAX_THOUGHT_HISTORY` thoughts (default 1000) are retained, the oldest dropped first and from its branch too, so a long-lived connection no longer grows memory without bound.
