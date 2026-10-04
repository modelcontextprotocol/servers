---
"@modelcontextprotocol/server-everything": patch
---

Fix the async task tools: `trigger-elicitation-request-async` now stops polling before the 10-minute TTL it requests for the client's task runs out, instead of polling past it and failing on a task the client has expired (#4986); and `trigger-sampling-request-async` reports the status message of a client task that is already finished when it is created, instead of "No message" (#4987).
