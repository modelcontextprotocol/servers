---
"@modelcontextprotocol/server-memory": major
---

Move to the TypeScript SDK v2 packages (`@modelcontextprotocol/server`) from `@modelcontextprotocol/sdk` 1.x (#4856). Breaking for clients: the server now requires Node.js 20 or later; over stdio, a single incoming JSON-RPC message larger than 10 MiB now closes the connection (the SDK v2 default read-buffer cap; SDK 1.x buffered without a limit); an unknown tool name is rejected with JSON-RPC error `-32602` instead of returning an `isError` result; error messages no longer carry the `MCP error <code>: ` prefix, and input-validation messages name the field first (`field: message`); tool schemas in `tools/list` declare JSON Schema 2020-12 instead of draft-07; and tools no longer advertise `execution.taskSupport`.
