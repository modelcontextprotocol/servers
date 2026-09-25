---
"servers/everything" patch
---

Fix `get-resource-reference` / `resource-prompt` prompt argument missing description for `resourceType`

The `resourceType` prompt argument on `resource-prompt` (and `get-resource-reference` tool) now includes the allowed values in its description: `"Type of resource — must be 'Text' or 'Blob'."`. This allows automated callers to determine valid values without guessing or relying on error messages.

Previously the description only said `"Type of resource to fetch"` with no enumeration of allowed values, causing schema-completeness warnings and hard failures during automated invocation (e.g., mcp-probe).

See [issue #3985](https://github.com/modelcontextprotocol/servers/issues/3985) for context.
