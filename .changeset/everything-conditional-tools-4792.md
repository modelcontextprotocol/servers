---
"@modelcontextprotocol/server-everything": patch
---

Server instructions no longer tell every client to use tools that are registered only for clients declaring a capability; they list those tools and the capability each needs (#4792, ported from #4835). `trigger-elicitation-request` and `trigger-elicitation-request-async` are now registered only for clients that support form-mode elicitation, so a client that declared only URL-mode elicitation no longer sees tools it cannot answer (#4985).
