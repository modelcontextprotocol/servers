---
"@modelcontextprotocol/server-everything": patch
---

`resource-prompt` now names the values its arguments accept in `prompts/list`: `resourceType` must be "Text" or "Blob", and `resourceId` must be a positive integer. Prompt arguments carry no schema, so clients had no way to learn these before calling the prompt.
