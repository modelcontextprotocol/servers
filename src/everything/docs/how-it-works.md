# Everything Server - How It Works

**[Architecture](architecture.md)
| [Project Structure](structure.md)
| [Startup Process](startup.md)
| [Server Features](features.md)
| [Extension Points](extension.md)
| How It Works**

# Conditional Tool Registration

### Modules: `server/index.ts`, `tools/index.ts`

- Some tools require client support for the capability they demonstrate. These are:
  - `get-roots-list`
  - `trigger-elicitation-request`
  - `trigger-multi-step-elicitation`
  - `trigger-sampling-request`
  - `trigger-url-elicitation`
- **2025 era**: client capabilities aren't known until the initialization handshake is complete, so these tools are registered by `registerConditionalTools(server, context)`, invoked from an `oninitialized` handler, for a client that declared the capability.
- **2026-07-28**: there is no handshake, and each request carries the client's capabilities in `_meta`, so `registerModernTools(server, context)` registers them up front. The SDK refuses a call whose embedded request the client did not declare (`-32021`).

# Multi-Round-Trip Requests

### Modules: the elicitation, sampling and roots tools

- A tool that needs client input returns `inputRequired({ inputRequests })` instead of a result. A 2026-07-28 client fulfils the embedded requests and retries the call with `inputResponses`; for a 2025-era client the SDK's legacy shim sends real `elicitation/create`, `sampling/createMessage` or `roots/list` requests and re-enters the handler with the answers. Each handler is written once.
- The handler reads the answers with `inputResponse(...)` (any kind, including a decline) or `acceptedContent(..., schema)` (a validated form answer).
- A flow of several rounds carries what it has learned in `requestState`. `trigger-multi-step-elicitation` mints it with `roundStateCodec` (HMAC-signed, ten-minute expiry, process-wide key), passed to the server as `requestState.verify`, so a tampered or expired state is refused with `-32602` before the handler runs.

# Tasks

### Module: `server/tasks.ts`

- Serves the tasks extension (`io.modelcontextprotocol/tasks`) on 2026-07-28: `tasks/get`, `tasks/update` and `tasks/cancel`, with explicit schemas.
- `createTask(behavior, options)` stores a task under a minted UUID and returns the `tools/call` result that hands its handle to the client (`resultType: "task"`). A task's `behavior` works out its state from the clock (`stateAt`) and takes the client's answers (`receive`), so nothing runs in the background. Tasks past their TTL are dropped when the store is next touched.

## Resource Subscriptions

### Module: `resources/subscriptions.ts`

- **2025 era**: `setSubscriptionHandlers(server, subscribed)` processes subscribe/unsubscribe requests, keeping the instance's set of subscribed URIs.
- Updates are started/stopped on demand by the `toggle-subscriber-updates` tool, which calls `beginSimulatedResourceUpdates(server, subscribed)` and keeps the stop function it returns; the instance's `cleanup()` stops it too.
- **2026-07-28**: the serving entry handles `subscriptions/listen` itself. The context's publisher (`server/context.ts`) sends changes from the instance on stdio, where `serveStdio` routes them onto the open streams, and through the handler's bus over Streamable HTTP.

## Session‑scoped and Minted Resources

### Modules: `resources/session.ts`, `resources/minted.ts`

- `getSessionResourceURI(name: string)`: Builds a session resource URI: `demo://resource/session/<name>`.
- `registerSessionResource(server, resource, type, payload)`: Registers a resource with the given `uri`, `name`, and `mimeType`, returning a `resource_link`. The content is served from memory for the life of the session only. Supports `type: "text" | "blob"` and returns data in the corresponding field.
- `mintBlobResource(name, mimeType, blob)`: on 2026-07-28, where an instance may not outlive the request, stores the resource process-wide under `demo://resource/minted/<uuid>/<name>` for ten minutes and returns a `resource_link`; `registerMintedResources(server)` serves the store through one template.
- Intended usage: tools can create and expose artifacts without persisting them. For example, `tools/gzip-file-as-resource.ts` compresses fetched content and returns either a `resource_link` to a session or minted resource, by era, or an inline `resource`, based on `outputType`.

## Logging

### Modules: `server/logging.ts`, `tools/trigger-log-messages.ts`

- **2025 era**: `beginSimulatedLogging(server)` periodically sends randomized log messages at different levels, and returns the function that stops it. `toggle-simulated-logging` starts and stops it; the instance's `cleanup()` stops it too. It uses `server.sendLoggingMessage(params, sessionId)` so that the level the client set with `logging/setLevel` is respected by the SDK.
- **Both eras**: `trigger-log-messages` sends one message per level with `ctx.mcpReq.log(...)`, which the SDK filters by the request's `_meta` log level on 2026-07-28 and by the session level on the 2025 era.
