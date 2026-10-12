---
"@modelcontextprotocol/server-memory": minor
---

Serve the 2026-07-28 protocol revision alongside the 2025 era on stdio, through the SDK's `serveStdio` entry (#4852). A 2026-07-28 client gets `notifications/resources/updated` for `memory://knowledge-graph` on a `subscriptions/listen` stream whose `resourceSubscriptions` name it; 2025-era clients still subscribe with `resources/subscribe`.
