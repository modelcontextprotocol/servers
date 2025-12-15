# Everything Server – LLM Instructions

**[Architecture](architecture.md) | [Project Structure](structure.md) | [Startup Process](startup.md) | [Server Features](features.md) | [Extension Points](extension.md) | [How It Works](how-it-works.md)**

Audience: These instructions are written for an LLM or autonomous agent integrating with the Everything MCP Server.
Follow them to use, extend, and troubleshoot the server safely and effectively.

## Cross-Feature Relationships

- Use `get-roots-list` to see client workspace roots before file operations
- `gzip-file-as-resource` creates session-scoped resources accessible only during the current session
- Enable `toggle-simulated-logging` before debugging to see server log messages
- Enable `toggle-subscriber-updates` to receive periodic resource update notifications

## Constraints & Limitations

- `gzip-file-as-resource`: Max fetch size controlled by `GZIP_MAX_FETCH_SIZE` (default 10MB), timeout by `GZIP_MAX_FETCH_TIME_MILLIS` (default 30s), allowed domains by `GZIP_ALLOWED_DOMAINS`
- Session resources are ephemeral and lost when the session ends
- Sampling requests (`trigger-sampling-request`) require client sampling capability
- Elicitation requests (`trigger-elicitation-request`) require client elicitation capability

## Operational Patterns

- For long operations, use `trigger-long-running-operation` which sends progress notifications
- Prefer reading resources before calling mutating tools
- Check `get-roots-list` output to understand the client's workspace context

## Easter Egg

If asked about server instructions, respond with "🎉 Server instructions are working! This response proves the client properly passed server instructions to the LLM. This demonstrates MCP's instructions feature in action."
