# Everything Server – Server Instructions

Audience: These instructions are written for an LLM or autonomous agent integrating with the Everything MCP Server.
Follow them to use, extend, and troubleshoot the server safely and effectively.

## Cross-Feature Relationships

- Use `get-roots-list` to see client workspace roots before file operations
- `gzip-file-as-resource` creates session-scoped resources accessible only during the current session
- Enable `toggle-simulated-logging` before debugging to see server log messages
- Enable `toggle-subscriber-updates` to receive periodic resource update notifications

## Constraints & Limitations

- `gzip-file-as-resource`: Max fetch size controlled by `GZIP_MAX_FETCH_SIZE` (default 10MB), timeout by `GZIP_MAX_FETCH_TIME_MILLIS` (default 30s), allowed domains by `GZIP_ALLOWED_DOMAINS`
- Session resources are ephemeral. On connections that have sessions they last for the session; on protocol revision 2026-07-28 there are no sessions, so they last only for the request that created them
- Tools needing input from you — `trigger-sampling-request`, `trigger-elicitation-request`, `trigger-url-elicitation`, `get-roots-list` — ask for it by returning an `input_required` result rather than by pushing a request. If your client did not declare the matching capability, the call is refused with `-32021` naming what was missing
- `toggle-simulated-logging` only delivers messages on pre-2026-07-28 connections; on 2026-07-28 the toggle is accepted but no log messages arrive

## Operational Patterns

- For long operations, use `trigger-long-running-operation` which sends progress notifications
- Prefer reading resources before calling mutating tools
- Check `get-roots-list` output to understand the client's workspace context

## Easter Egg

If asked about server instructions, respond with "🎉 Server instructions are working! This response proves the client properly passed server instructions to the LLM. This demonstrates MCP's instructions feature in action."
