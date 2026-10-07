---
"@modelcontextprotocol/server-sequential-thinking": major
---

Move to the TypeScript SDK v2 packages (`@modelcontextprotocol/server`) from `@modelcontextprotocol/sdk` 1.x (#4856). Breaking for clients: the server now requires Node.js 20 or later; an unknown tool name is rejected with JSON-RPC error `-32602` instead of returning an `isError` result; error messages no longer carry the `MCP error <code>: ` prefix, and input-validation messages name the field first (`field: message`); tool schemas in `tools/list` declare JSON Schema 2020-12 instead of draft-07; and tools no longer advertise `execution.taskSupport`.
