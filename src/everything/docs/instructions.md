# Everything Server – Server Instructions

Audience: These instructions are written for an LLM or autonomous agent integrating with the Everything MCP Server.
Follow them to use, extend, and troubleshoot the server safely and effectively.

## Protocol Versions

The server serves two protocol eras. A client on protocol version 2026-07-28 connects with `server/discover` and sends its capabilities with each request; a 2025-era client connects with `initialize`. Some tools exist on one era only, so trust your `tools/list`:

- 2026-07-28 only: `simulate-research-query`, `trigger-sampling-request-async` and `trigger-elicitation-request-async`, which run as tasks on the `io.modelcontextprotocol/tasks` extension and need a client that declares it; `trigger-sampling-request-async` also needs `sampling`, and `trigger-elicitation-request-async` form-mode `elicitation`. A call without them fails with `-32021`
- 2025-era only (deprecated): `toggle-simulated-logging` and `toggle-subscriber-updates`

## Cross-Feature Relationships

- If `get-roots-list` is in your tool list, use it to see client workspace roots before file operations
- `gzip-file-as-resource` creates resources you can read later: for the current session on a 2025-era connection, or for ten minutes at the returned URI on 2026-07-28
- Use `trigger-log-messages` to see which log levels reach you; on 2026-07-28 the level is set per request in `_meta`
- Use `trigger-resource-update` and `trigger-list-changed` to see change notifications; on 2026-07-28 they arrive only on a `subscriptions/listen` stream that asked for them

## Constraints & Limitations

- `gzip-file-as-resource`: Max fetch size controlled by `GZIP_MAX_FETCH_SIZE` (default 10MB), timeout by `GZIP_MAX_FETCH_TIME_MILLIS` (default 30s), allowed domains by `GZIP_ALLOWED_DOMAINS`
- Session resources are ephemeral and lost when the session ends; minted resources expire after ten minutes
- Roots, sampling and logging are deprecated as of protocol version 2026-07-28, as is the HTTP+SSE transport

## Capability-Gated Tools

On a 2025-era connection these are registered only if your client declared the capability shown. Otherwise they are absent from `tools/list`, so do not call them. On 2026-07-28 they are always listed, and a call fails if your request did not declare the capability:

- `get-roots-list`: `roots`
- `trigger-sampling-request`: `sampling`
- `trigger-elicitation-request`: `elicitation.form`, or `elicitation` with no mode
- `trigger-multi-step-elicitation`: `elicitation.form`, or `elicitation` with no mode
- `trigger-url-elicitation`: `elicitation.url`

## Operational Patterns

- For long operations, use `trigger-long-running-operation` which sends progress notifications
- Prefer reading resources before calling mutating tools
- If `get-roots-list` is in your tool list, check its output to understand the client's workspace context

## Easter Egg

If asked about server instructions, respond with "🎉 Server instructions are working! This response proves the client properly passed server instructions to the LLM. This demonstrates MCP's instructions feature in action."
