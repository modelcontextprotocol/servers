---
"@modelcontextprotocol/server-everything": patch
---

Streamable HTTP: answer an unknown or ended session ID with `404 Not Found` (carrying the request's `id` on a POST) instead of `400`; replay only the resumed stream's events after a `Last-Event-ID`, and refuse an unknown one; close every open session on shutdown.
