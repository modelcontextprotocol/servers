---
"@modelcontextprotocol/server-everything": patch
---

Label dynamic blob resources `application/octet-stream`, matching their resource template, instead of `text/plain`. This applies to `resources/read`, the `get-resource-reference` and `get-resource-links` tools, and the `resource-prompt` prompt; blob resource links are now described as "binary blob resource".
