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
- Some tools are only registered for clients that declared the matching capability; see Capability-Gated Tools below

## Capability-Gated Tools

These tools are registered after initialization, and only if your client declared the matching
capability. If it did not, the tool is absent from `tools/list` for this session rather than
present-and-failing, so do not attempt to call it.

| Tool                                | Required client capability                             |
| ----------------------------------- | ------------------------------------------------------ |
| `get-roots-list`                    | `roots`                                                |
| `trigger-sampling-request`          | `sampling`                                             |
| `trigger-elicitation-request`       | `elicitation`                                          |
| `trigger-url-elicitation`           | `elicitation.url`                                      |
| `trigger-sampling-request-async`    | `sampling` and `tasks.requests.sampling.createMessage` |
| `trigger-elicitation-request-async` | `elicitation` and `tasks.requests.elicitation.create`  |

Every other tool in this document is registered for every client. Treat `tools/list` as
authoritative: it reflects the capabilities you declared.

## Operational Patterns

- For long operations, use `trigger-long-running-operation` which sends progress notifications
- Prefer reading resources before calling mutating tools
- If `get-roots-list` is in your tool list, check its output to understand the client's workspace context

## Easter Egg

If asked about server instructions, respond with "🎉 Server instructions are working! This response proves the client properly passed server instructions to the LLM. This demonstrates MCP's instructions feature in action."
