---
"@modelcontextprotocol/server-everything": minor
---

The Streamable HTTP transport now evicts a 2025-era session that has been idle for 30 minutes: one with no request in flight and no stream open. Until now a session whose client never sent a DELETE stayed in memory, with its server instance, for the life of the process. An evicted session's next request is answered `404 Session not found`, the spec's signal for the client to initialize again. Set the new `SESSION_IDLE_TIMEOUT_MILLIS` environment variable to change the timeout, or to `0` to keep sessions until their client ends them. 2026-07-28 clients have no sessions and are unaffected. Thanks to @Pierpaolo1223 for the report and the measurements in [#5558](https://github.com/modelcontextprotocol/servers/issues/5558).
