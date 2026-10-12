# Everything Server - Startup Process

**[Architecture](architecture.md)
| [Project Structure](structure.md)
| Startup Process
| [Server Features](features.md)
| [Extension Points](extension.md)
| [How It Works](how-it-works.md)**

## 1. Everything Server Launcher

- Usage `node dist/index.js [stdio|sse|streamableHttp]`
- Runs the specified **transport manager** to handle client connections.
- Specify transport type on command line (default `stdio`)
  - `stdio` → `transports/stdio.js`
  - `sse` → `transports/sse.js` (deprecated, 2025-era clients only; prints a warning)
  - `streamableHttp` → `transports/streamableHttp.js`

## 2. The Transport Manager

- Serves server instances built by `createServer()` from `server/index.ts`, one per connection (or per request), each for the protocol era the client speaks.
- Handles communication according to the MCP specs for the chosen transport.
  - **STDIO**:
    - One process‑bound connection, served by the SDK's `serveStdio` entry.
    - The client's first message picks the era: `server/discover` (or any request with the 2026-07-28 `_meta` envelope) for 2026-07-28, `initialize` for the 2025 era. `serveStdio` then builds the server for that era with `createServer({ era })` and pins it to the connection (it may build and discard one more first, to answer a discover probe).
    - Runs an instance's `cleanup()` when it closes, and on `SIGINT` closes the connection, cleans up and exits.
  - **SSE** (deprecated; 2025-era clients only):
    - Supports multiple client connections, one server per `GET /sse` stream.
    - Client transports are mapped to `sessionId`.
    - Hooks server’s `onclose` to clean and remove session.
    - Exposes
      - `/sse` **GET** (SSE stream)
      - `/message` **POST** (JSON‑RPC messages)
  - **Streamable HTTP**: one `/mcp` endpoint for both eras.
    - **2026-07-28**: a session-less **POST** carrying the per-request `_meta` envelope is served by the SDK's `createMcpHandler`, which builds a fresh server per request with `createServer({ era: "modern", publish })`. There are no sessions. Change notifications are published on the handler's subscription bus (`publish`), which reaches every open `subscriptions/listen` stream.
    - **2025 era**: everything else, classified by the SDK's `isLegacyRequest`, keeps the sessionful wiring: a server per session, created on the `initialize` **POST**, with **GET** for the standalone SSE stream and **DELETE** to end the session. Transports are stored by `sessionId`, an event store makes streams resumable, and the session's `cleanup()` runs when it closes. Sessionful serving keeps the server-to-client channel the legacy shim needs for elicitation, sampling and roots.
    - A session-less POST's body is parsed once (up to 4 MiB) to classify it and serve it.
  - **SSE** and **Streamable HTTP** bind their port (`PORT`, default `3001`) through `listenOrExit()` in `transports/listen.ts`.
    - The listening line is printed only once the port is bound.
    - A bind failure, such as a port already in use, is reported on stderr and the process exits non-zero.

## 3. The Server Factory

- Invoke `createServer({ era, publish })` from `server/index.ts`
- Creates a new `McpServer` instance with
  - **Capabilities**:
    - `tools: { listChanged: true }`
    - `logging: {}`
    - `prompts: { listChanged: true }`
    - `resources: { subscribe: true, listChanged: true }`
    - `extensions: { "io.modelcontextprotocol/tasks": {} }` (2026-07-28 only)
  - **Server Instructions**
    - Loaded from the docs folder (`instructions.md`).
  - **Options**
    - Cache hints for the 2026-07-28 cacheable results (`cacheHints`).
    - The `requestState` verifier for multi-round tools (`roundStateCodec`).
  - **Registrations**
    - Builds a per-instance **context** (`server/context.ts`): the era, where change notifications go, the 2025-era resource subscriptions, and a cleanup registry.
    - Registers **tools** via `registerTools(server, context)`, and then by era: `registerModernTools` and the tasks extension (`server/tasks.ts`) for 2026-07-28; `registerLegacyTools` now and `registerConditionalTools` once the client has initialized, for the 2025 era.
    - Registers **resources** via `registerResources(server, context)`.
    - Registers **prompts** via `registerPrompts(server)`.
  - **Other Request Handlers** (2025 era)
    - Sets up resource subscription handlers via `setSubscriptionHandlers(server, subscribed)`.
    - Syncs the client's roots after `initialize` via `syncRoots(server)`, which also installs the `roots/list_changed` handler.
  - **Returns**
    - The `McpServer` instance
    - A `cleanup()` callback that stops the instance's intervals and clears its state

## Enabling Multiple Clients

Every piece of per-connection state lives on the server instance that serves the connection: there are no maps keyed by session id. On stdio and on a 2025-era session one instance serves the whole connection; on the 2026-07-28 HTTP path each request gets its own instance, so what must outlive a request (a task, a minted resource) is stored process-wide under a handle the server mints.
