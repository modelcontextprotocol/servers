# Everything Server - Features

**[Architecture](architecture.md)
| [Project Structure](structure.md)
| [Startup Process](startup.md)
| Server Features
| [Extension Points](extension.md)
| [How It Works](how-it-works.md)**

## Tools

- `echo` (tools/echo.ts): Echoes the provided `message: string`. Uses Zod to validate inputs.
- `get-annotated-message` (tools/get-annotated-message.ts): Returns a `text` message annotated with `priority` and `audience` based on `messageType` (`error`, `success`, or `debug`); can optionally include an annotated `image`.
- `get-env` (tools/get-env.ts): Returns all environment variables from the running process as pretty-printed JSON text.
- `get-resource-links` (tools/get-resource-links.ts): Returns an intro `text` block followed by multiple `resource_link` items. For a requested `count` (1–10), alternates between dynamic Text and Blob resources using URIs from `resources/templates.ts`.
- `get-resource-reference` (tools/get-resource-reference.ts): Accepts `resourceType` (`text` or `blob`) and `resourceId` (positive integer). Returns a concrete `resource` content block (with its `uri`, `mimeType`, and data) with surrounding explanatory `text`.
- `get-roots-list` (tools/get-roots-list.ts): Reports the client's workspace roots. On the legacy era the server has usually already pulled them after the handshake and answers from cache; on 2026-07-28 there is nothing cached, so it asks for them via `inputRequired` and the client retries with the listing attached.
- `gzip-file-as-resource` (tools/gzip-file-as-resource.ts): Accepts a `name` and `data` (URL or data URI), fetches the data subject to size/time/domain constraints, compresses it, registers it as a session resource at `demo://resource/session/<name>` with `mimeType: application/gzip`, and returns either a `resource_link` (default) or an inline `resource` depending on `outputType`.
- `get-structured-content` (tools/get-structured-content.ts): Demonstrates structured responses. Accepts `location` input and returns both backward‑compatible `content` (a `text` block containing JSON) and `structuredContent` validated by an `outputSchema` (temperature, conditions, humidity). The output schema has an **object** root — the only shape any revision before 2026-07-28 allowed.
- `get-structured-content-list` (tools/get-structured-content-list.ts): The same idea with an **array** root, which 2026-07-28 newly permits (SEP-2106 lifted the object-only restriction on `outputSchema`). Accepts `location` and `days` (1–5, default 3) and returns a bare array of daily forecast entries. The handler is era-agnostic and returns the natural array; the SDK adapts the wire shape per era — identity on 2026-07-28, and for a legacy peer it projects *both* the advertised schema (to `{"type":"object","properties":{"result":…}}`) and the payload (to `{"result": [...]}`) so the two cannot drift apart. Note this automatic legacy projection is TypeScript-specific; the Go, Python and Rust SDKs do not currently perform it.
- `get-sum` (tools/get-sum.ts): For two numbers `a` and `b` calculates and returns their sum. Uses Zod to validate inputs.
- `get-tiny-image` (tools/get-tiny-image.ts): Returns a tiny PNG MCP logo as an `image` content item with brief descriptive text before and after.
- `trigger-long-running-operation` (tools/trigger-long-running-operation.ts): Simulates a multi-step operation over a given `duration` and number of `steps`; reports progress via `notifications/progress` when a `progressToken` is provided by the client.
- `toggle-simulated-logging` (tools/toggle-simulated-logging.ts): Starts or stops simulated, random‑leveled logging for the invoking session. **Legacy era only** — see [Simulated Logging](#simulated-logging).
- `toggle-subscriber-updates` (tools/toggle-subscriber-updates.ts): Starts or stops simulated resource update notifications for URIs the invoking session has subscribed to.
- `trigger-elicitation-request` (tools/trigger-elicitation-request.ts): Asks for a form-mode elicitation covering the full range of field types (strings, numbers, booleans, enums, format validation) and reports the resulting action/content. Requires client capability `elicitation`.
- `trigger-url-elicitation` (tools/trigger-url-elicitation.ts): Asks for a URL-mode elicitation (`mode: "url"`), directing the user to a browser flow, then reports whether they completed, declined, or cancelled it. Requires client capability `elicitation.url`. (The v1 `-32042` / `errorPath` variant is gone — see [Multi Round-Trip Requests](#multi-round-trip-requests-sep-2322).)
- `trigger-sampling-request` (tools/trigger-sampling-request.ts): Asks the client/LLM for a completion using the provided `prompt` and optional generation controls; returns the response payload. Requires client capability `sampling`.
- `simulate-research-query` (tools/simulate-research-query.ts): Simulates a multi-stage research operation, reporting progress per stage. Accepts `topic` and `ambiguous`. When `ambiguous` is true it pauses partway and asks which interpretation of the topic you meant, then resumes and produces the report. The only **multi-round** flow in this server: it threads the topic across rounds in an HMAC-sealed `requestState`.

## Prompts

- `simple-prompt` (prompts/simple.ts): No-argument prompt that returns a static user message.
- `args-prompt` (prompts/args.ts): Two-argument prompt with `city` (required) and `state` (optional) used to compose a question.
- `completable-prompt` (prompts/completions.ts): Demonstrates argument auto-completions with the SDK’s `completable` helper; `department` completions drive context-aware `name` suggestions.
- `resource-prompt` (prompts/resource.ts): Accepts `resourceType` ("Text" or "Blob") and `resourceId` (string convertible to integer) and returns messages that include an embedded dynamic resource of the selected type generated via `resources/templates.ts`.

## Resources

- Dynamic Text: `demo://resource/dynamic/text/{index}` (content generated on the fly)
- Dynamic Blob: `demo://resource/dynamic/blob/{index}` (base64 payload generated on the fly)
- Static Documents: `demo://resource/static/document/<filename>` (serves files from `src/everything/docs/` as static file-based resources)

### Result caching (2026-07-28)

The revision requires `ttlMs` and `cacheScope` on cacheable results. Values resolve
most-specific-author-first: fields the handler puts on the result, then a
per-registration `cacheHint`, then the server-level `ServerOptions.cacheHints`, then the
conservative default (`ttlMs: 0`, `cacheScope: "private"`). These fields are emitted only
toward modern-era clients — legacy responses are byte-for-byte unchanged.

This server exercises two of those layers:

| Surface                                                    | Hint                              | Why                                                       |
| ---------------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| `tools/list`, `prompts/list`, `resources/list`, `resources/templates/list`, `server/discover` | server-level, 60s `public`        | static for the process lifetime and identical per caller  |
| Static Documents (`resources/read`)                        | per-registration, 1h `public`     | ship inside the package; only change when it is rebuilt   |
| Dynamic, Session Scoped (`resources/read`)                  | none — falls through to the default | generated per call, or scoped to one caller               |
- Session Scoped: `demo://resource/session/<name>` (per-session resources registered dynamically; available only for the lifetime of the session)

## Resource Subscriptions and Notifications

- Simulated update notifications are opt‑in and off by default.
- Use the `toggle-subscriber-updates` tool to start/stop an interval that emits
  `notifications/resources/updated { uri }`.
- How a client registers interest differs by era, and the server supports both:
  - **Legacy era** — `resources/subscribe` / `resources/unsubscribe`. Subscribers are
    tracked per session as `Map<uri, Set<sessionId>>`, and updates are delivered through
    the server instance bound to that session.
  - **2026-07-28** — `resources/subscribe` no longer exists. Clients open a
    `subscriptions/listen` stream and name the notification types they want
    (`toolsListChanged`, `promptsListChanged`, `resourcesListChanged`,
    `resourceSubscriptions`). The serving entry answers `subscriptions/listen` itself; the
    server publishes onto its bus and the bus does the filtering.
- Publishing is routed through `server/notifier.ts` so tools do not have to care which of
  the two is in play.

## Simulated Logging

- Simulated logging is available but off by default.
- Use the `toggle-simulated-logging` tool to start/stop periodic log messages of varying
  levels (debug, info, notice, warning, error, critical, alert, emergency) per session.
- **Legacy era only.** This models a connection-scoped log stream: a background interval
  pushing unsolicited `notifications/message` at whatever level the client selected with
  `logging/setLevel`.
- 2026-07-28 removed both halves. `logging/setLevel` is gone — the level is now a
  per-request `io.modelcontextprotocol/logLevel` key in `_meta`, and a server **MUST NOT**
  emit `notifications/message` for a request that did not carry it. There is no
  connection-level channel for a background interval to write to, so on a modern
  connection the toggle is accepted but no messages arrive. The failure is quiet rather
  than loud: the send is filtered out rather than rejected, so nothing destabilises.

## Multi Round-Trip Requests (SEP-2322)

The 2026-07-28 revision removed the server-to-client JSON-RPC request channel. A server
that needs input from the client no longer _pushes_ `elicitation/create`,
`sampling/createMessage`, or `roots/list` — it **returns** an `input_required` result
naming what it needs, and the client retries the original call carrying
`inputResponses`.

### Written once, served to both eras

Every tool here is written in the 2026 `inputRequired(...)` style, with no branching on
protocol era. On a legacy-era connection the SDK's legacy shim turns the same return into
real server-to-client requests over the live session and re-enters the handler with the
answers collected. The handler cannot tell which era served it.

| Tool                          | Asks for                                   |
| ----------------------------- | ------------------------------------------ |
| `trigger-elicitation-request` | form-mode `elicitation/create`             |
| `trigger-url-elicitation`     | URL-mode `elicitation/create`              |
| `trigger-sampling-request`    | `sampling/createMessage`                   |
| `get-roots-list`              | `roots/list`                               |
| `simulate-research-query`     | form-mode `elicitation/create`, mid-flight |

### Multi-round flows and `requestState`

`inputResponses` are **per round** — a retry carries only that round's answers, never
earlier ones. Anything that must survive the trip through the client goes in
`requestState`, an opaque server-minted string the client echoes back byte-for-byte.

`simulate-research-query` is the worked example: it pauses at the synthesis stage to ask
which interpretation of an ambiguous topic you meant, carrying the topic forward in
`requestState` so the resumed round can finish the report.

Because `requestState` round-trips through the client it is **untrusted input** on
re-entry. This server seals it with HMAC-SHA256 via `createRequestStateCodec`
(`server/request-state.ts`), bound to the originating method and authenticated principal,
and verifies it before any handler runs.

### Capability requirements

A tool needing a capability the caller never declared is refused at dispatch with
`-32021 MissingRequiredClientCapability`, whose `data.requiredCapabilities` lists what was
missing. This is a spec **MUST**, and it is why tools are registered unconditionally
rather than hidden — `tools/list` may not vary per connection on 2026-07-28.

### Tasks

This server no longer demonstrates tasks. The 2025-11-25 experimental tasks API was
removed in SDK v2, and 2026-07-28 moved tasks into an extension
(`io.modelcontextprotocol/tasks`, SEP-2663) that the SDK cannot currently serve: `tasks/*`
are spec method names absent from the modern era's registry, so they are answered `-32601`
even when a handler is registered, and they cannot be re-registered as vendor-prefixed
custom methods. `simulate-research-query` keeps the staged progress and mid-flight
elicitation it always demonstrated; only the task wire shape is gone.
