---
"@modelcontextprotocol/server-filesystem": patch
---

Every tool's input and output schema in `tools/list` now declares `"$schema": "https://json-schema.org/draft/2020-12/schema"` instead of draft-07, so clients that validate tool schemas strictly against JSON Schema 2020-12 no longer reject every tool. The schemas are otherwise unchanged.
