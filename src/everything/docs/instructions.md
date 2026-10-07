# Everything Server – Server Instructions

Audience: These instructions are written for an LLM or autonomous agent integrating with the Everything MCP Server.
Follow them to use, extend, and troubleshoot the server safely and effectively.

## Cross-Feature Relationships

- If `get-roots-list` is in your tool list, use it to see client workspace roots before file operations
- `gzip-file-as-resource` creates session-scoped resources accessible only during the current session
- Enable `toggle-simulated-logging` before debugging to see server log messages
- Enable `toggle-subscriber-updates` to receive periodic resource update notifications

## Constraints & Limitations

- `gzip-file-as-resource`: Max fetch size controlled by `GZIP_MAX_FETCH_SIZE` (default 10MB), timeout by `GZIP_MAX_FETCH_TIME_MILLIS` (default 30s), allowed domains by `GZIP_ALLOWED_DOMAINS`
- Session resources are ephemeral and lost when the session ends

## Capability-Gated Tools

Registered only if your client declared the capability shown. Otherwise they are absent from `tools/list`, so do not call them:

- `get-roots-list`: `roots`
- `trigger-sampling-request`: `sampling`
- `trigger-elicitation-request`: `elicitation.form`, or `elicitation` with no mode
- `trigger-url-elicitation`: `elicitation.url`

## Operational Patterns

- For long operations, use `trigger-long-running-operation` which sends progress notifications
- Prefer reading resources before calling mutating tools
- If `get-roots-list` is in your tool list, check its output to understand the client's workspace context

## Easter Egg

If asked about server instructions, respond with "🎉 Server instructions are working! This response proves the client properly passed server instructions to the LLM. This demonstrates MCP's instructions feature in action."
