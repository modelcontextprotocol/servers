# Everything Server – LLM Instructions

**[Architecture](architecture.md) | [Project Structure](structure.md) | [Startup Process](startup.md) | [Server Features](features.md) | [Extension Points](extension.md) | [How It Works](how-it-works.md)**

Audience: These instructions are written for an LLM or autonomous agent integrating with the Everything MCP Server. Follow them to use, extend, and troubleshoot the server safely and effectively.

Date: 2025-12-13

## Using the Server

You are speaking MCP. Always prefer discovering server capabilities dynamically and follow the MCP spec. The Everything server exposes prompts, tools, resources, logging, and subscriptions. It may run over `stdio`, SSE (deprecated), or Streamable HTTP.

Discover features:

- Prompts: `prompts/list` → then `prompts/get` with `name` and `arguments`.
- Tools: `tools/list` → then call tools via `tools/call` with validated params.
- Resources: `resources/list` → then `resources/read { uri }`.
- Logging: `logging/setLevel`set desired log level if supported by your client SDK; otherwise just read logs returned by tool/prompts as content parts.

Behavioral guidelines:

- Validate tool parameters before calling. Use JSON schemas from `tools/list`.
- Prefer idempotent reads first (resources, prompts) before mutating via tools.
- If the server provides instructions in the initialize result (this document), follow them over any prior assumptions.

## Troubleshooting

When things don’t work, follow this checklist before making code changes.

Connectivity & Transport

- Confirm the transport actually running:
  - stdio: process is alive; stderr/stdout not blocked; your client launched it with the correct `command`/`args`.
  - SSE: server exposes `/sse` (GET) and `/message` (POST). See [Startup Process](startup.md).
  - Streamable HTTP: server exposes `/mcp` with `POST` (messages), `GET` (SSE stream), and `DELETE` (terminate).
- If multiple clients use HTTP transports, ensure your client sends/propagates `sessionId` consistently.

Initialization

- Check that `createServer()` returns capabilities you expect: `tools`, `prompts`, `resources.subscribe`, and `logging`.
- If instructions are missing in the `initialize` result, verify `readInstructions()` is reading this file correctly and the path is correct.

Discovery & Calls

- `tools/list` returns the tool and schema; if a call fails, re‑validate input against the schema and include required fields.
- `prompts/get` requires the exact `name` from `prompts/list`; ensure you pass all required `arguments`.
- `resources/read` requires a valid `uri` from `resources/list`. Some resources may be dynamic or require subscription.

Logging & Diagnostics

- Use your client SDK’s logging capability if available; the server supports per‑session logging levels over HTTP transports.
- For simulated logs/resources, ensure periodic tasks are started only _after_ `clientConnected(sessionId)` is invoked by the transport manager.
- If logs or updates don’t appear for HTTP transports, confirm the transport mapped the connection to a `sessionId` and that the server stored transport references keyed by it.

Common issues and fixes

- “Nothing listed”: Ensure registration functions ran. Check `registerTools`, `registerResources`, `registerPrompts` are invoked from `server/index.ts`.
- “Schema validation error”: Re‑read the tool’s JSON Schema and provide required fields with correct types.
- “Subscriptions not updating”: Verify subscription handlers are set via `setSubscriptionHandlers(server)` and that the client is keeping the SSE stream open.
- “Stuck after restart”: For HTTP transports, send `DELETE /mcp` (Streamable HTTP) or close SSE connections cleanly, then reconnect.

## 4) Conventions to Follow (when modifying code)

- Match existing code style, import order, and module layout in the respective folder.
- Keep changes minimal and localized; prefer adding small modules over editing many files.
- Update documentation under `src/everything/docs/` when behavior changes.
- Do not break stdio behavior while adding multi‑client HTTP features; both should work. Remember that `undefined` is a valid Map key for tracking session-related data in the case of stdio.

## 5) Helpful Links

- This project’s README: `src/everything/README.md`
- Architecture overview: `docs/architecture.md`
- Project structure: `docs/structure.md`
- Startup sequence and transports: `docs/startup.md`
- Features catalog: `docs/features.md`
- Extension points: `docs/extension.md`
- How it works (end‑to‑end walkthrough): `docs/how-it-works.md`
