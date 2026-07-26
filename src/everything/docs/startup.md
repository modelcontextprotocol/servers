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
  - `sse` → `transports/sse.js`
  - `streamableHttp` → `transports/streamableHttp.js`

## 2. The Transport Manager

Each transport hands the **server factory itself** to an SDK serving entry, rather than
constructing one server and connecting it to a transport. The entry decides which protocol
era a given connection or request is on, and calls the factory to build an instance for it.

- **STDIO** — `serveStdio(ctx => createServer(ctx))` from `@modelcontextprotocol/server/stdio`.
  - Serves **both eras**. The opening exchange decides which: a `server/discover` probe
    means 2026-07-28, an `initialize` handshake means the legacy era.
  - One factory instance is pinned for the connection lifetime.
  - Pass `{ legacy: "reject" }` to refuse legacy-era openings.
  - Closes the handle and calls `cleanupSession()` on `SIGINT`.
- **Streamable HTTP** — `createMcpHandler(ctx => createServer(ctx))` wrapped with
  `toNodeHandler` from `@modelcontextprotocol/node`, mounted at `app.all("/mcp", …)`.
  - Serves **both eras from one endpoint and one route**: 2026-07-28 per request, and — on
    the default `legacy: "stateless"` posture — legacy traffic per request through the
    stateless idiom. The handler classifies each request and routes it internally.
  - A fresh instance is built per request. There is no session map, no `mcp-session-id`,
    no event store, and no hand-rolled GET/DELETE routes: 2026-07-28 removed
    protocol-level sessions and SSE resumability, and replaced the standalone GET
    notification stream with `subscriptions/listen`, which the handler answers itself.
  - `handler.notify` is registered as the change-notification bus at startup via
    `setBusNotifier`.
  - `handler.close()` on `SIGINT` aborts in-flight exchanges and sends the graceful-close
    result on every open `subscriptions/listen` stream.
- **SSE** — the deprecated HTTP+SSE transport (protocol revision 2024-11-05), served from
  `@modelcontextprotocol/server-legacy`.
  - **Legacy era only** — it predates Streamable HTTP and has no 2026-07-28 equivalent, so
    it builds the factory with an explicit `{ era: "legacy" }` context.
  - Supports multiple clients; transports are mapped by `sessionId`.
  - Hooks the server's `onclose` to call `cleanupSession(sessionId)` and remove the session.
  - Exposes `/sse` **GET** (SSE stream) and `/message` **POST** (JSON‑RPC messages).

## 3. The Server Factory

- `createServer(ctx?)` from `server/index.ts`, called by the serving entry once per
  serving unit — one HTTP request under `createMcpHandler`, one connection under
  `serveStdio`.
- `ctx` carries the `era` this instance will serve, plus (HTTP only) `authInfo` and
  `requestInfo`. It does **not** carry client capabilities: those arrive per request in
  `_meta` on the modern era.
- Creates a new `McpServer` instance with
  - **Capabilities**: `tools: { listChanged }`, `prompts: { listChanged }`,
    `resources: { subscribe, listChanged }`, `logging: {}`.
  - **Server Instructions** — loaded from `docs/instructions.md`.
  - **Cache hints** — real `ttlMs` / `cacheScope` for the cacheable list surfaces, instead
    of the SDK's conservative `ttlMs: 0` / `private` default. Modern era only; these fields
    never appear on legacy responses.
  - **`requestState` verification** — `requestStateCodec.verify` is wired into
    `ServerOptions.requestState`, so an echoed `requestState` is integrity-checked before
    any handler runs.
  - **Registrations** — `registerTools(server)`, `registerResources(server)`,
    `registerPrompts(server)`. All tools register unconditionally; there is no longer a
    capability-gated second pass.
  - **Other Request Handlers** — `setSubscriptionHandlers(server)` installs the legacy-era
    `resources/subscribe` / `resources/unsubscribe` handlers.
  - **Legacy-only hook** — on a legacy-era instance, `oninitialized` schedules `syncRoots`
    to pull `roots/list` after the handshake. 2026-07-28 has no handshake and no
    server-to-client request channel, so on the modern era the `get-roots-list` tool asks
    for roots via `inputRequired` instead.
  - **Returns** the `McpServer` instance. Session teardown is a separate module-level
    `cleanupSession(sessionId?)` export, since the factory's return value is now the
    instance itself.

## Sessions and Multiple Clients

The `sse` transport and legacy-era Streamable HTTP connections have sessions, and map
per-client state to a session identifier.

2026-07-28 removed protocol-level sessions entirely. Modern-era serving is per request and
holds nothing between exchanges — cross-call state is carried in explicit, server-minted
handles instead (`requestState` for multi-round flows; see
[How It Works](how-it-works.md#multi-round-trip-requests)).
