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
     │   ├── notifier.ts
     │   ├── request-state.ts
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
     │   ├── get-structured-content-list.ts
     │   ├── get-sum.ts
     │   ├── get-tiny-image.ts
     │   ├── gzip-file-as-resource.ts
     │   ├── simulate-research-query.ts
     │   ├── toggle-simulated-logging.ts
     │   ├── toggle-subscriber-updates.ts
     │   ├── trigger-elicitation-request.ts
     │   ├── trigger-long-running-operation.ts
     │   ├── trigger-sampling-request.ts
     │   └── trigger-url-elicitation.ts
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
- Declares dependencies on the SDK v2 packages — `@modelcontextprotocol/server` (plus `/stdio`), `@modelcontextprotocol/node`, `@modelcontextprotocol/core`, and `@modelcontextprotocol/server-legacy` (the frozen SSE transport, used only by `transports/sse.ts`) — along with `express`, `cors`, `zod`, etc. The v1 `@modelcontextprotocol/sdk` package is **not** used: v2 split it into separate server/client packages and raised the floor to Node ≥ 20.

### `docs/`

Every file here is also served as a static resource at
`demo://resource/static/document/<filename>` (see `resources/files.ts`), so these
documents are part of the server's own surface, not just repo documentation.

- `architecture.md`
  - Runtime architecture and high-level overview, including the dual-era design.
- `structure.md`
  - This document: the project layout and what each module does.
- `startup.md`
  - How a process comes up: launcher, transport manager, and the server factory.
- `features.md`
  - The catalogue of tools, prompts, resources, and protocol features exercised.
- `extension.md`
  - How to add a tool, prompt, or resource without breaking era-agnosticism.
- `how-it-works.md`
  - Deeper notes on capability gating, multi-round-trip flows, and notification routing.
- `instructions.md`
  - Human‑readable instructions intended to be passed to the client/LLM as guidance on server use. Loaded by the server at startup and returned as `instructions` — in the `initialize` result on the legacy era, and in the `server/discover` result on 2026-07-28.

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
  - Attaches a per-registration `cacheHint` (1h, `public`): these ship inside the package and only change when it is rebuilt.
- `session.ts`
  - Session-scoped resources at `demo://resource/session/<name>`, served from memory. `getSessionResourceURI(name)` builds the URI and `registerSessionResource(...)` registers the payload and returns a `resource_link`. Used by `gzip-file-as-resource.ts`. On 2026-07-28 there are no sessions, so such a resource lives only for the request that created it.
- `subscriptions.ts`
  - Tracks subscribers per URI as `Map<uri, Set<sessionId>>` and installs the **legacy-era only** `resources/subscribe` / `resources/unsubscribe` handlers via `setSubscriptionHandlers(server)`. Also drives the simulated update interval that `toggle-subscriber-updates` starts and stops. Modern clients register interest with `subscriptions/listen` instead, which the serving entry answers itself.

### `server/`

- `index.ts`
  - Server factory `createServer(ctx?)` that creates an `McpServer` with declared capabilities, cache hints, and `requestState` verification; loads server instructions; and registers tools, prompts, and resources.
  - Called by the SDK serving entry once per serving unit — one HTTP request under `createMcpHandler`, one connection under `serveStdio`. `ctx` carries the `era` being served, plus (HTTP only) `authInfo` and `requestInfo`.
  - Sets resource subscription handlers via `setSubscriptionHandlers(server)`, and on legacy-era instances installs the `oninitialized` hook that pulls the client's roots.
  - Returns the `McpServer`. Session teardown is the separate `cleanupSession(sessionId?)` export, which stops any running intervals when a session ends.
- `logging.ts`
  - Implements simulated logging. Periodically sends randomized log messages at various levels to the connected client session. Started/stopped on demand via a dedicated tool. Legacy era only — 2026-07-28 has no connection-level notification channel for a background interval to write to.
- `notifier.ts`
  - Routes change notifications to whichever publish path the active transport needs: instance methods under `serveStdio` (which routes them onto open subscriptions), or the handler's `subscriptions/listen` bus under `createMcpHandler`, where each request gets a fresh instance with no long-lived stream. Tools call `getNotifier(server)` and stay unaware of the difference.
- `request-state.ts`
  - The shared HMAC-SHA256 `requestState` codec for multi-round-trip tools. `requestState` round-trips through the client and is untrusted on re-entry, so it is sealed and bound to the originating method and principal. `verify` is wired into `ServerOptions.requestState` so it runs before any handler. Signed, not encrypted — never put secrets in the payload.
- `roots.ts`
  - `syncRoots(server, sessionId?)` pulls the client's workspace roots with a server-to-client `roots/list` request and caches them for `get-roots-list`. **Legacy era only** — it is driven by the `oninitialized` hook, and 2026-07-28 has neither a handshake nor a server-to-client request channel, so on the modern era the tool asks via `inputRequired.listRoots()` instead.

### `tools/`

- `index.ts`
  - `registerTools(server)` orchestrator; delegates to tool factory/registration methods in individual tool files.
- `echo.ts`
  - Registers an `echo` tool that takes a message and returns `Echo: {message}`.
- `get-annotated-message.ts`
  - Registers a `get-annotated-message` tool which demonstrates content-level annotations. Emits a primary `text` message with content `annotations` (`priority`, `audience`) that vary by `messageType` (`"error" | "success" | "debug"`), and optionally includes an annotated `image` (tiny PNG) when `includeImage` is true. All tools in this server include tool-level annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).
- `get-env.ts`
  - Registers a `get-env` tool that returns the current process environment variables as formatted JSON text; useful for debugging configuration.
- `get-resource-links.ts`
  - Registers a `get-resource-links` tool that returns an intro `text` block followed by multiple `resource_link` items.
- `get-resource-reference.ts`
  - Registers a `get-resource-reference` tool that returns a reference for a selected dynamic resource.
- `get-roots-list.ts`
  - Registers a `get-roots-list` tool that reports the client's workspace roots. On the legacy era the server has usually already pulled and cached them after the handshake; on 2026-07-28 nothing is cached, so the tool asks via `inputRequired.listRoots()` and the client retries with the listing attached. The cache lookup simply misses on the modern era, so one code path serves both.
- `gzip-file-as-resource.ts`
  - Registers a `gzip-file-as-resource` tool that fetches content from a URL or data URI, compresses it, and then either:
    - returns a `resource_link` to a session-scoped resource (default), or
    - returns an inline `resource` with the gzipped data. The resource will be still discoverable for the duration of the session via `resources/list`.
  - Uses `resources/session.ts` to register the gzipped blob as a per-session resource at a URI like `demo://resource/session/<name>` with `mimeType: application/gzip`.
  - Environment controls:
    - `GZIP_MAX_FETCH_SIZE` (bytes, default 10 MiB)
    - `GZIP_MAX_FETCH_TIME_MILLIS` (ms, default 30000)
    - `GZIP_ALLOWED_DOMAINS` (comma-separated allowlist; empty means all domains allowed)
- `simulate-research-query.ts`
  - Registers a `simulate-research-query` tool simulating a multi-stage research operation with per-stage progress notifications. When the query is marked ambiguous it pauses mid-execution and asks which interpretation was meant, then resumes and produces the report. The only multi-round flow here: the topic is carried across rounds in an HMAC-sealed `requestState`, since `inputResponses` are per round.
- `trigger-elicitation-request.ts`
  - Registers a `trigger-elicitation-request` tool that asks for a form-mode `elicitation/create` covering the full range of supported field types, and reports the resulting action/content.
- `trigger-url-elicitation.ts`
  - Registers a `trigger-url-elicitation` tool that asks for a URL-mode `elicitation/create` (`mode: "url"`) directing the user to a browser flow, then reports whether they completed, declined, or cancelled it. The v1 `-32042` `UrlElicitationRequiredError` error path is gone: it is legacy-era only (the SDK refuses that throw on a modern request and steers to `inputRequired.elicitUrl(...)`), and its session-keyed retry-suppression `Set` has no modern equivalent since 2026-07-28 has no sessions.
- `trigger-sampling-request.ts`
  - Registers a `trigger-sampling-request` tool that asks the client/LLM for a completion and returns the sampling result.
- `get-structured-content.ts`
  - Registers a `get-structured-content` tool that demonstrates structuredContent block responses, with an object-rooted `outputSchema`.
- `get-structured-content-list.ts`
  - Registers a `get-structured-content-list` tool whose `outputSchema` is an **array** at the root — the shape SEP-2106 newly permits at 2026-07-28. The handler returns the bare array on both eras; the SDK's wire codec projects the schema and the payload together into the legacy `{result: …}` shape for pre-2026 peers, so no `ctx.era` branch is needed in the tool.
- `get-sum.ts`
  - Registers a `get-sum` tool with a Zod input schema that sums two numbers `a` and `b` and returns the result.
- `get-tiny-image.ts`
  - Registers a `get-tiny-image` tool, which returns a tiny PNG MCP logo as an `image` content item, along with surrounding descriptive `text` items.
- `trigger-long-running-operation.ts`
  - Registers a `trigger-long-running-operation` tool that simulates a long-running task over a specified `duration` (seconds) and number of `steps`; emits `notifications/progress` updates when the client supplies a `progressToken`.
- `toggle-simulated-logging.ts`
  - Registers a `toggle-simulated-logging` tool, which starts or stops simulated logging for the invoking session.
- `toggle-subscriber-updates.ts`
  - Registers a `toggle-subscriber-updates` tool, which starts or stops simulated resource subscription update checks for the invoking session.

### `transports/`

- `stdio.ts`
  - Hands the factory to `serveStdio(ctx => createServer(ctx))`, which serves **both eras** over stdio: the opening exchange selects one (`server/discover` probe → 2026-07-28, `initialize` handshake → legacy), and one instance is pinned for the connection.
  - Handles `SIGINT` to close the handle and calls `cleanupSession()` to remove any live intervals.
- `sse.ts`
  - The deprecated HTTP+SSE transport (protocol revision 2024-11-05), served from `@modelcontextprotocol/server-legacy`. **Legacy era only** — it predates Streamable HTTP and has no 2026-07-28 equivalent, so it builds the factory with an explicit `{ era: "legacy" }` context.
  - Express server exposing:
    - `GET /sse` to establish an SSE connection per session.
    - `POST /message` for client messages.
  - Manages multiple connected clients via a transport map; on disconnect calls `cleanupSession(sessionId)`.
- `streamableHttp.ts`
  - Hands the factory to `createMcpHandler(ctx => createServer(ctx))`, wrapped with `toNodeHandler` and mounted once as `app.all("/mcp", …)`. Serves **both eras from one endpoint**: 2026-07-28 per request, and legacy traffic per request through the default `legacy: "stateless"` posture.
  - No session map, no `mcp-session-id`, no `InMemoryEventStore`, and no hand-written GET/DELETE routes — 2026-07-28 removed protocol-level sessions and SSE resumability, and replaced the standalone GET notification stream with `subscriptions/listen`, which the handler answers itself.
  - Registers `handler.notify` as the change-notification bus via `setBusNotifier`, and on `SIGINT` calls `handler.close()` to abort in-flight exchanges and gracefully close open subscription streams.
