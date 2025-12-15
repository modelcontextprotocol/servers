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
     │   ├── session.ts
     │   ├── subscriptions.ts
     │   └── templates.ts
     ├── server
     │   ├── index.ts
     │   ├── logging.ts
     │   └── roots.ts
     ├── tools
     │   ├── index.ts
     │   ├── echo.ts
     │   ├── get-annotated-message.ts
     │   ├── get-env.ts
     │   ├── get-resource-links.ts
     │   ├── get-resource-reference.ts
     │   ├── get-roots-list.ts
     │   ├── get-structured-content.ts
     │   ├── get-sum.ts
     │   ├── get-tiny-image.ts
     │   ├── gzip-file-as-resource.ts
     │   ├── toggle-simulated-logging.ts
     │   ├── toggle-subscriber-updates.ts
     │   ├── trigger-elicitation-request.ts
     │   ├── trigger-long-running-operation.ts
     │   └── trigger-sampling-request.ts
     └── transports
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
- Declares dependencies on `@modelcontextprotocol/sdk`, `express`, `cors`, `zod`, etc.

### `docs/`

- `architecture.md`
  - This document.
- `server-instructions.md`
  - Human‑readable instructions intended to be passed to the client/LLM as for guidance on server use. Loaded by the server at startup and returned in the "initialize" exchange.

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
  - `registerResources(server)` orchestrator; delegates to resource factory/registration methods from individual resource files.
- `templates.ts`
  - Registers two dynamic, template‑driven resources using `ResourceTemplate`:
    - Text: `demo://resource/dynamic/text/{index}` (MIME: `text/plain`)
    - Blob: `demo://resource/dynamic/blob/{index}` (MIME: `application/octet-stream`, Base64 payload)
  - The `{index}` path variable must be a finite positive integer. Content is generated on demand with a timestamp.
  - Exposes helpers `textResource(uri, index)`, `textResourceUri(index)`, `blobResource(uri, index)`, and `blobResourceUri(index)` so other modules can construct and embed dynamic resources directly (e.g., from prompts).
- `files.ts`
  - Registers static file-based resources for each file in the `docs/` folder.
  - URIs follow the pattern: `demo://resource/static/document/<filename>`.
  - Serves markdown files as `text/markdown`, `.txt` as `text/plain`, `.json` as `application/json`, others default to `text/plain`.

### `server/`

- `index.ts`
  - Server factory that creates an `McpServer` with declared capabilities, loads server instructions, and registers tools, prompts, and resources.
  - Sets resource subscription handlers via `setSubscriptionHandlers(server)`.
  - Exposes `{ server, cleanup }` to the chosen transport. Cleanup stops any running intervals in the server when the transport disconnects.
- `logging.ts`
  - Implements simulated logging. Periodically sends randomized log messages at various levels to the connected client session. Started/stopped on demand via a dedicated tool.

### `tools/`

- `index.ts`
  - `registerTools(server)` orchestrator; delegates to tool factory/registration methods in individual tool files.
- `echo.ts`
  - Registers an `echo` tool that takes a message and returns `Echo: {message}`.
- `get-annotated-message.ts`
  - Registers an `annotated-message` tool which demonstrates annotated content items by emitting a primary `text` message with `annotations` that vary by `messageType` (`"error" | "success" | "debug"`), and optionally includes an annotated `image` (tiny PNG) when `includeImage` is true.
- `get-env.ts`
  - Registers a `get-env` tool that returns the current process environment variables as formatted JSON text; useful for debugging configuration.
- `get-resource-links.ts`
  - Registers a `get-resource-links` tool that returns an intro `text` block followed by multiple `resource_link` items.
- `get-resource-reference.ts`
  - Registers a `get-resource-reference` tool that returns a reference for a selected dynamic resource.
- `get-roots-list.ts`
  - Registers a `get-roots-list` tool that returns the last list of roots sent by the client.
- `gzip-file-as-resource.ts`
  - Registers a `gzip-file-as-resource` tool that fetches content from a URL or data URI, compresses it, and then either:
    - returns a `resource_link` to a session-scoped resource (default), or
    - returns an inline `resource` with the gzipped data. The resource will be still discoverable for the duration of the session via `resources/list`.
  - Uses `resources/session.ts` to register the gzipped blob as a per-session resource at a URI like `demo://resource/session/<name>` with `mimeType: application/gzip`.
  - Environment controls:
    - `GZIP_MAX_FETCH_SIZE` (bytes, default 10 MiB)
    - `GZIP_MAX_FETCH_TIME_MILLIS` (ms, default 30000)
    - `GZIP_ALLOWED_DOMAINS` (comma-separated allowlist; empty means all domains allowed)
- `trigger-elicitation-request.ts`
  - Registers a `trigger-elicitation-request` tool that sends an `elicitation/create` request to the client/LLM and returns the elicitation result.
- `trigger-sampling-request.ts`
  - Registers a `trigger-sampling-request` tool that sends a `sampling/createMessage` request to the client/LLM and returns the sampling result.
- `get-structured-content.ts`
  - Registers a `get-structured-content` tool that demonstrates structuredContent block responses.
- `get-sum.ts`
  - Registers an `get-sum` tool with a Zod input schema that sums two numbers `a` and `b` and returns the result.
- `get-tiny-image.ts`
  - Registers a `get-tiny-image` tool, which returns a tiny PNG MCP logo as an `image` content item, along with surrounding descriptive `text` items.
- `trigger-long-running-operation.ts`
  - Registers a `long-running-operation` tool that simulates a long-running task over a specified `duration` (seconds) and number of `steps`; emits `notifications/progress` updates when the client supplies a `progressToken`.
- `toggle-simulated-logging.ts`
  - Registers a `toggle-simulated-logging` tool, which starts or stops simulated logging for the invoking session.
- `toggle-subscriber-updates.ts`
  - Registers a `toggle-subscriber-updates` tool, which starts or stops simulated resource subscription update checks for the invoking session.

### `transports/`

- `stdio.ts`
  - Starts a `StdioServerTransport`, created the server via `createServer()`, and connects it.
  - Handles `SIGINT` to close cleanly and calls `cleanup()` to remove any live intervals.
- `sse.ts`
  - Express server exposing:
    - `GET /sse` to establish an SSE connection per session.
    - `POST /message` for client messages.
  - Manages multiple connected clients via a transport map.
  - Starts an `SSEServerTransport`, created the server via `createServer()`, and connects it to a new transport.
  - On server disconnect, calls `cleanup()` to remove any live intervals.
- `streamableHttp.ts`
  - Express server exposing a single `/mcp` endpoint for POST (JSON‑RPC), GET (SSE stream), and DELETE (session termination) using `StreamableHTTPServerTransport`.
  - Uses an `InMemoryEventStore` for resumable sessions and tracks transports by `sessionId`.
  - Connects a fresh server instance on initialization POST and reuses the transport for subsequent requests.
