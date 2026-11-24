---
"@modelcontextprotocol/server-everything": minor
---

Serve the Events extension (`io.modelcontextprotocol/events`, SEP-3415) on protocol version 2026-07-28: `events/list`, `events/poll` and `events/stream`, with a replayable `clock-tick` event type (poll and push) and an emit-only `custom-event` (push), raised by the new `trigger-event` tool. Webhook delivery is not offered.
