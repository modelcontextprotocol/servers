# Everything Server - Project Structure

**[Architecture](architecture.md)
| Project Structure
| [Startup Process](startup.md)
| [Server Features](features.md)
| [Extension Points](extension.md)
| [How It Works](how-it-works.md)**

```
src/everything
     ├── index.ts
     ├── AGENTS.md
     ├── package.json
     ├── docs
     │   ├── architecture.md
     │   ├── extension.md
     │   ├── features.md
     │   ├── how-it-works.md
     │   ├── instructions.md
     │   ├── startup.md
     │   └── structure.md
     ├── prompts
     │   ├── index.ts
     │   ├── args.ts
     │   ├── completions.ts
     │   ├── simple.ts
     │   └── resource.ts
     ├── resources
     │   ├── index.ts
     │   ├── files.ts
     │   ├── minted.ts
     │   ├── session.ts
     │   ├── subscriptions.ts
     │   └── templates.ts
     ├── server
     │   ├── index.ts
     │   ├── context.ts
     │   ├── logging.ts
     │   ├── roots.ts
     │   └── tasks.ts
     ├── tools
     │   ├── index.ts
     │   ├── echo.ts
     │   ├── get-annotated-message.ts
     │   ├── get-env.ts
     │   ├── get-header-params.ts
     │   ├── get-resource-links.ts
     │   ├── get-resource-reference.ts
     │   ├── get-roots-list.ts
     │   ├── get-structured-content.ts
     │   ├── get-sum.ts
     │   ├── get-tiny-image.ts
     │   ├── gzip-file-as-resource.ts
     │   ├── simulate-research-query.ts
     │   ├── toggle-simulated-logging.ts
     │   ├── toggle-subscriber-updates.ts
     │   ├── trigger-elicitation-request-async.ts
     │   ├── trigger-elicitation-request.ts
     │   ├── trigger-list-changed.ts
     │   ├── trigger-log-messages.ts
     │   ├── trigger-long-running-operation.ts
     │   ├── trigger-multi-step-elicitation.ts
     │   ├── trigger-resource-update.ts
     │   ├── trigger-sampling-request-async.ts
     │   ├── trigger-sampling-request.ts
     │   └── trigger-url-elicitation.ts
     └── transports
         ├── in-memory-event-store.ts
         ├── listen.ts
         ├── sse.ts
         ├── stdio.ts
         └── streamableHttp.ts
```

# Project Contents

## `src/everything`:

### `index.ts`

- CLI entry point that selects and runs a specific transport module based on the first CLI argument: `stdio`, `sse`, or `streamableHttp`.

### `AGENTS.md`

- Directions for Agents/LLMs explaining coding guidelines and how to appropriately extend the server.

### `package.json`

- Package metadata and scripts:
  - `build`: TypeScript compile to `dist/`, copies `docs/` into `dist/` and marks the compiled entry scripts as executable.
  - `start:stdio`, `start:sse`, `start:streamableHttp`: Run built transports from `dist/`.
- Declares dependencies on the TypeScript SDK v2 packages (`@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `@modelcontextprotocol/server-legacy`), `express`, `cors`, `zod`, etc.

### `docs/`

- `architecture.md`
  - Describes the server architecture, including transport layers, session initialization, and primitive registration.
- `extension.md`
  - Explains how to extend the server with new tools, prompts, resources, or transports.
- `features.md`
  - A comprehensive reference listing all implemented prompts, resources, tools, and protocol behaviors.
- `how-it-works.md`
  - Explains how SSE and Streamable HTTP transports are set up and how sessions are managed.
- `instructions.md`
  - Human‑readable instructions intended to be passed to the client/LLM as guidance on server use. Loaded by the server at startup and returned in the initialize exchange.
- `startup.md`
  - Describes the server startup sequence, environment checks, and initialization.
- `structure.md`
  - This document.

### `prompts/`

- `index.ts`
  - `registerPrompts(server)` orchestrator; delegates to prompt factory/registration methods from in individual prompt files.
- `simple.ts`
  - Registers `simple-prompt`: a prompt with no arguments that returns a single user message.
- `args.ts`
  - Registers `args-prompt`: a prompt with two arguments (`city` required, `state` optional) used to compose a message.
- `completions.ts`
  - Registers `completable-prompt`: a prompt whose arguments support server-driven completions using the SDK’s `completable(...)` helper (e.g., completing `department` and context-aware `name`).
- `resource.ts`
  - Exposes `registerEmbeddedResourcePrompt(server)` which registers `resource-prompt` — a prompt that accepts `resourceType` ("Text" or "Blob") and `resourceId` (integer), and embeds a dynamically generated resource of the requested type within the returned messages. Internally reuses helpers from `resources/templates.ts`.

### `resources/`

- `index.ts`
  - `registerResources(server, context)` orchestrator; delegates to resource factory/registration methods from individual resource files, adding the minted-resource template on 2026-07-28.
- `templates.ts`
  - Registers two dynamic, template‑driven resources using `ResourceTemplate`:
    - Text: `demo://resource/dynamic/text/{index}` (MIME: `text/plain`)
    - Blob: `demo://resource/dynamic/blob/{index}` (MIME: `application/octet-stream`, Base64 payload)
  - The `{index}` path variable must be a finite positive integer; any other is not found (`-32602`). Content is generated on demand with a timestamp.
  - Exposes helpers `textResource(uri, index)`, `textResourceUri(index)`, `blobResource(uri, index)`, and `blobResourceUri(index)` so other modules can construct and embed dynamic resources directly (e.g., from prompts).
- `files.ts`
  - Registers static file-based resources for each file in the `docs/` folder.
  - URIs follow the pattern: `demo://resource/static/document/<filename>`.
  - Serves markdown files as `text/markdown`, `.txt` as `text/plain`, `.json` as `application/json`, others default to `text/plain`.
  - Gives each a one-hour public cache hint for 2026-07-28 reads.
- `minted.ts`
  - 2026-07-28: stores resources tools create under server-minted URIs (`demo://resource/minted/<id>/<name>`) for ten minutes, process-wide, and serves them through one template.
- `session.ts`
  - 2025 era: registers resources tools create on the session's server instance (`demo://resource/session/<name>`).
- `subscriptions.ts`
  - 2025 era: the `resources/subscribe` and `resources/unsubscribe` handlers, and the timed updates `toggle-subscriber-updates` drives.

### `server/`

- `index.ts`
  - Server factory that creates an `McpServer` for a protocol era (`createServer({ era, publish })`) with declared capabilities, cache hints and the `requestState` verifier, loads server instructions, and registers tools, prompts, and resources for that era.
  - On the 2025 era, sets resource subscription handlers via `setSubscriptionHandlers(server, subscribed)` and registers the capability-gated tools after `initialize`.
  - Exposes `{ server, cleanup }` to the chosen transport. Cleanup stops any running intervals in the server when the connection ends.
- `context.ts`
  - The per-instance context features receive: the era, the change publisher, the 2025-era subscriptions and a cleanup registry.
- `logging.ts`
  - Implements simulated logging (2025 era). Periodically sends randomized log messages at various levels to the connected client. Started/stopped on demand via a dedicated tool.
- `roots.ts`
  - 2025 era: syncs the client's roots after `initialize` and on `roots/list_changed`, reporting each answer as a log message.
- `tasks.ts`
  - 2026-07-28: the server side of the tasks extension (`tasks/get`, `tasks/update`, `tasks/cancel`) and the process-wide task store the task tools create tasks in.

### `tools/`

- `index.ts`
  - Registration orchestrators, by era: `registerTools(server, context)` (both), `registerLegacyTools` and `registerConditionalTools` (2025 era), `registerModernTools` (2026-07-28). Each delegates to the registration methods in individual tool files.
- `echo.ts`
  - Registers an `echo` tool that takes a message and returns `Echo: {message}`.
- `get-annotated-message.ts`
  - Registers a `get-annotated-message` tool which demonstrates content-level annotations. Emits a primary `text` message with content `annotations` (`priority`, `audience`) that vary by `messageType` (`"error" | "success" | "debug"`), and optionally includes an annotated `image` (tiny PNG) when `includeImage` is true. All tools in this server include tool-level annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).
- `get-env.ts`
  - Registers a `get-env` tool that returns the current process environment variables as formatted JSON text; useful for debugging configuration.
- `get-header-params.ts`
  - Registers a `get-header-params` tool with JSON Schema 2020-12 input and output schemas whose `region` argument carries `x-mcp-header`; returns the argument and the `Mcp-Param-Region` header it arrived in.
- `get-resource-links.ts`
  - Registers a `get-resource-links` tool that returns an intro `text` block followed by multiple `resource_link` items.
- `get-resource-reference.ts`
  - Registers a `get-resource-reference` tool that returns a reference for a selected dynamic resource.
- `get-roots-list.ts`
  - Registers a `get-roots-list` tool that asks the client for its roots with a multi-round-trip request and lists them.
- `gzip-file-as-resource.ts`
  - Registers a `gzip-file-as-resource` tool that fetches content from a URL or data URI, compresses it, and then either:
    - returns a `resource_link` (default) to a resource it can read later, or
    - returns an inline `resource` with the gzipped data.
  - The linked resource is a per-session resource at `demo://resource/session/<name>` (`resources/session.ts`) for a 2025-era client, and a minted one at `demo://resource/minted/<id>/<name>` (`resources/minted.ts`) for a 2026-07-28 client, with `mimeType: application/gzip`.
  - Environment controls:
    - `GZIP_MAX_FETCH_SIZE` (bytes, default 10 MiB)
    - `GZIP_MAX_FETCH_TIME_MILLIS` (ms, default 30000)
    - `GZIP_ALLOWED_DOMAINS` (comma-separated allowlist; empty means all domains allowed)
- `simulate-research-query.ts`
  - 2026-07-28: registers a `simulate-research-query` tool that runs as a task on the tasks extension, through four timed stages, pausing at `input_required` for a clarification on an ambiguous topic.
- `trigger-elicitation-request.ts`
  - Registers a `trigger-elicitation-request` tool that asks for a form with a multi-round-trip request and returns the elicitation result.
- `trigger-elicitation-request-async.ts`
  - 2026-07-28: registers a `trigger-elicitation-request-async` tool that runs as a task waiting in `input_required` for a form elicitation.
- `trigger-list-changed.ts`
  - Registers a `trigger-list-changed` tool that publishes a tools, prompts or resources list change.
- `trigger-log-messages.ts`
  - Registers a `trigger-log-messages` tool that sends one log message per level, filtered by the request's or session's log level.
- `trigger-multi-step-elicitation.ts`
  - Registers a `trigger-multi-step-elicitation` tool that asks two questions in sequence, carrying the first answer in a signed `requestState`.
- `trigger-resource-update.ts`
  - Registers a `trigger-resource-update` tool that publishes a `notifications/resources/updated` for a URI.
- `trigger-sampling-request-async.ts`
  - 2026-07-28: registers a `trigger-sampling-request-async` tool that runs as a task waiting in `input_required` for a sampling request.
- `trigger-url-elicitation.ts`
  - On 2026-07-28, registers a `trigger-url-elicitation` tool that returns its URL elicitation in-band (`input_required`). On the 2025 era, it either sends an out-of-band URL-mode `elicitation/create` request (`mode: "url"`) including an `elicitationId` (request path) or throws `UrlElicitationRequiredError` (`-32042`) for client-handled URL elicitation (error path). On the error path the carried prerequisite elicitation points at a different URL than the failing one (`https://modelcontextprotocol.io`), and when the client satisfies it and retries the same call, the retry ignores `errorPath` and proceeds via the request path — so the client does not loop on the same error.
- `trigger-sampling-request.ts`
  - Registers a `trigger-sampling-request` tool that asks the client's LLM for a completion with a multi-round-trip request and returns the sampling result.
- `get-structured-content.ts`
  - Registers a `get-structured-content` tool that demonstrates structuredContent block responses.
- `get-sum.ts`
  - Registers a `get-sum` tool with a Zod input schema that sums two numbers `a` and `b` and returns the result.
- `get-tiny-image.ts`
  - Registers a `get-tiny-image` tool, which returns a tiny PNG MCP logo as an `image` content item, along with surrounding descriptive `text` items.
- `trigger-long-running-operation.ts`
  - Registers a `trigger-long-running-operation` tool that simulates a long-running task over a specified `duration` (seconds) and number of `steps`; emits `notifications/progress` updates when the client supplies a `progressToken`.
- `toggle-simulated-logging.ts`
  - 2025 era: registers a `toggle-simulated-logging` tool, which starts or stops simulated logging for the connection.
- `toggle-subscriber-updates.ts`
  - 2025 era: registers a `toggle-subscriber-updates` tool, which starts or stops simulated resource subscription updates for the connection.

### `transports/`

- `in-memory-event-store.ts`
  - `InMemoryEventStore`: the Streamable HTTP transport's event store for resumability. Replays only the events of the stream a `Last-Event-ID` belongs to, and reports an unknown event ID as having no stream, so the SDK refuses the resume.
- `listen.ts`
  - `listenOrExit(app, port, listeningMessage)`: binds an Express app to its port for both HTTP transports.
  - Prints the listening message only once the port is bound; on a bind failure (such as a port already in use) prints why and exits non-zero.
- `stdio.ts`
  - Serves `createServer({ era })` over a `StdioServerTransport` with the SDK's `serveStdio`, which picks the connection's era from the client's first message.
  - Runs each instance's `cleanup()` when it closes, and handles `SIGINT` to close cleanly.
- `sse.ts`
  - Deprecated; 2025-era clients only. Warns on start.
  - Express server exposing:
    - `GET /sse` to establish an SSE connection per session.
    - `POST /message` for client messages.
  - Manages multiple connected clients via a transport map.
  - Starts an `SSEServerTransport` (from the frozen `@modelcontextprotocol/server-legacy/sse` bridge), created the server via `createServer()`, and connects it to a new transport.
  - On server disconnect, calls `cleanup()` to remove any live intervals.
- `streamableHttp.ts`
  - Express server exposing a single `/mcp` endpoint for both protocol eras.
  - 2026-07-28: a session-less POST carrying the per-request envelope (classified by the SDK's `isLegacyRequest`) is served by `createMcpHandler`, a fresh server per request, publishing change notifications on the handler's bus.
  - 2025 era: POST (JSON‑RPC), GET (SSE stream), and DELETE (session termination) using `NodeStreamableHTTPServerTransport` from `@modelcontextprotocol/node`.
  - Uses an `InMemoryEventStore` for resumable sessions and tracks transports by `sessionId`.
  - Answers a request for an unknown or ended `Mcp-Session-Id` with `404 Not Found`, and closes every open session on `SIGINT`.
  - Connects a fresh server instance on initialization POST and reuses the transport for subsequent requests.
