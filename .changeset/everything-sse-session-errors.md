---
"@modelcontextprotocol/server-everything": patch
---

The HTTP+SSE transport now answers requests for sessions it cannot serve instead of leaving them hanging or failing with a 500: `POST /message` for an unknown session returns `404` (and `400` with no `sessionId`), and `GET /sse?sessionId=…` returns `409` for a session that already has its stream and `404` for an unknown one. Each carries a JSON-RPC error body.
