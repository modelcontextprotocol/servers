# Everything Server - How It Works

**[Architecture](architecture.md)
| [Project Structure](structure.md)
| [Startup Process](startup.md)
| [Server Features](features.md)
| [Extension Points](extension.md)
| How It Works**

# Capability Gating

### Module: `server/index.ts`, `tools/index.ts`

Some tools need a client capability to do their job — `get-roots-list`,
`trigger-elicitation-request`, `trigger-url-elicitation`, `trigger-sampling-request`.

Previously these were **deferred**: registration waited for an `oninitialized` handler so
that `getClientCapabilities()` could be consulted, and a separate
`registerConditionalTools(server)` pass registered whichever the client could support.

That is gone. Every tool is now registered up front, unconditionally, for three reasons:

1. **There is no handshake to wait for.** 2026-07-28 removed `initialize`, so a
   modern-era factory never learns capabilities at construction time. The factory context
   carries only `era`, `authInfo`, and `requestInfo`.
2. **Capabilities are per request, not per connection.** Every modern request carries its
   own `io.modelcontextprotocol/clientCapabilities` in `_meta` — "capabilities relevant to
   this request". There is no single client-wide value a tool list could be gated on.
3. **List endpoints may not vary.** The spec removed per-connection variation from
   `tools/list`, `resources/list`, and `prompts/list`, and asks for deterministic ordering
   so results stay cacheable. A capability-varying list would break that.

The replacement is a refusal at dispatch, which the spec mandates:

> A server **MUST NOT** rely on capabilities the client has not declared. If processing a
> request requires a capability the client did not include in
> `io.modelcontextprotocol/clientCapabilities`, the server **MUST** return a
> `MissingRequiredClientCapabilityError` (`-32021`) whose `data.requiredCapabilities` lists
> the missing capabilities.

The SDK enforces this for us on both eras, because every one of these tools asks for its
input by returning `inputRequired(...)`. A caller that never declared the capability is
refused before the embedded request goes anywhere — as an `isError` tool result on the
legacy era, and as a `-32021` JSON-RPC error on the modern era.

## Multi Round-Trip Requests

### Modules: `tools/trigger-*.ts`, `tools/get-roots-list.ts`, `tools/simulate-research-query.ts`

Handlers never push a server-to-client request. They return
`inputRequired({ inputRequests: { … } })` and are re-entered with `ctx.mcpReq.inputResponses`
once the client answers. Written once, this serves the modern era natively and the legacy
era through the SDK's legacy shim.

`inputResponses` are per round, so multi-round flows carry what they have learned in
`requestState`. `server/request-state.ts` seals it with HMAC-SHA256 (bound to method and
principal); `ServerOptions.requestState.verify` runs on every round before the handler,
so `ctx.mcpReq.requestState<T>()` hands back an already-verified payload.

## Change Notification Routing

### Module: `server/notifier.ts`

The two serving entries publish differently, and tools should not have to know which is
running:

- `serveStdio` pins one instance per connection and routes that instance's
  `send*ListChanged()` / `sendResourceUpdated()` onto any open `subscriptions/listen`
  streams (or emits them unsolicited on the legacy era). Instance methods are correct there.
- `createMcpHandler` builds a fresh instance per request, so an instance has no long-lived
  stream. Publishing goes through the handler's `notify` facade over its event bus.

`getNotifier(server)` returns whichever is right; the Streamable HTTP entry registers the
bus at startup with `setBusNotifier(handler.notify)`.

## Resource Subscriptions

### Module: `resources/subscriptions.ts`

- Tracks subscribers per URI: `Map<uri, Set<sessionId>>`.
- Installs handlers via `setSubscriptionHandlers(server)` to process subscribe/unsubscribe requests and keep the map updated. `resources/subscribe` and `resources/unsubscribe` are **legacy-era only** — they are physically absent from the modern era's method registry, so registering them unconditionally is harmless (an inbound `resources/subscribe` on a modern connection is answered `-32601` regardless). Modern clients use `subscriptions/listen`, which the serving entry handles itself.
- Updates are started/stopped on demand by the `toggle-subscriber-updates` tool, which calls `beginSimulatedResourceUpdates(server, sessionId)` and `stopSimulatedResourceUpdates(sessionId)`.
- Publishing goes through `getNotifier(server)` rather than the instance directly, so updates reach the client on either era — see [Change Notification Routing](#change-notification-routing).
- `cleanupSession(sessionId?)` calls `stopSimulatedResourceUpdates(sessionId)` to clear intervals and remove session‑scoped state. Only meaningful where a session exists; modern-era HTTP serving is per request and holds nothing between exchanges.

## Session‑scoped Resources

### Module: `resources/session.ts`

- `getSessionResourceURI(name: string)`: Builds a session resource URI: `demo://resource/session/<name>`.
- `registerSessionResource(server, resource, type, payload)`: Registers a resource with the given `uri`, `name`, and `mimeType`, returning a `resource_link`. The content is served from memory for the life of the session only. Supports `type: "text" | "blob"` and returns data in the corresponding field.
- Intended usage: tools can create and expose per-session artifacts without persisting them. For example, `tools/gzip-file-as-resource.ts` compresses fetched content, registers it as a session resource with `mimeType: application/gzip`, and returns either a `resource_link` or an inline `resource` based on `outputType`.

## Simulated Logging

### Module: `server/logging.ts`

- Periodically sends randomized log messages at different levels. Messages can include the session ID for clarity during demos.
- Started/stopped on demand via the `toggle-simulated-logging` tool, which calls `beginSimulatedLogging(server, sessionId?)` and `stopSimulatedLogging(sessionId?)`. Note that transport disconnect triggers `cleanupSession()` which also stops any active intervals.
- Uses `server.sendLoggingMessage({ level, data }, sessionId?)` so that the client’s configured minimum logging level is respected by the SDK.
- **Legacy era only, and the one feature here that cannot be made era-agnostic.** It models a connection-scoped stream, and 2026-07-28 removed both halves of that: `logging/setLevel` is gone in favour of a per-request `io.modelcontextprotocol/logLevel` in `_meta`, and a server **MUST NOT** emit `notifications/message` for a request that did not carry it. With no connection-level channel, a background interval has nothing to write to, so a modern client receives nothing. `sendLoggingMessage` filters the message out rather than rejecting, so the interval keeps running harmlessly. The era-agnostic equivalent would be a request-scoped burst via `ctx.mcpReq.log()` during the call, which demonstrates something different.
