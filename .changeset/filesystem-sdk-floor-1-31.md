---
"@modelcontextprotocol/server-filesystem": patch
---

Require `@modelcontextprotocol/sdk` 1.31.0 or later (was `^1.30.0`), so an install can no longer resolve an SDK version affected by GHSA-6qxp-vccf-f47h. The advisory concerns the SDK's OAuth client, which this server does not use.
