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
- `get-roots-list` (tools/get-roots-list.ts): Returns the last list of roots sent by the client.
- `gzip-file-as-resource` (tools/gzip-file-as-resource.ts): Accepts a `name` and `data` (URL or data URI), fetches the data subject to size/time/domain constraints, compresses it, registers it as a session resource at `demo://resource/session/<name>` with `mimeType: application/gzip`, and returns either a `resource_link` (default) or an inline `resource` depending on `outputType`.
- `get-structured-content` (tools/get-structured-content.ts): Demonstrates structured responses. Accepts `location` input and returns both backward‑compatible `content` (a `text` block containing JSON) and `structuredContent` validated by an `outputSchema` (temperature, conditions, humidity).
- `get-sum` (tools/get-sum.ts): For two numbers `a` and `b` calculates and returns their sum. Uses Zod to validate inputs.
- `get-tiny-image` (tools/get-tiny-image.ts): Returns a tiny PNG MCP logo as an `image` content item with brief descriptive text before and after.
- `trigger-long-running-operation` (tools/trigger-trigger-long-running-operation.ts): Simulates a multi-step operation over a given `duration` and number of `steps`; reports progress via `notifications/progress` when a `progressToken` is provided by the client.
- `toggle-simulated-logging` (tools/toggle-simulated-logging.ts): Starts or stops simulated, random‑leveled logging for the invoking session. Respects the client’s selected minimum logging level.
- `toggle-subscriber-updates` (tools/toggle-subscriber-updates.ts): Starts or stops simulated resource update notifications for URIs the invoking session has subscribed to.
- `trigger-sampling-request` (tools/trigger-sampling-request.ts): Issues a `sampling/createMessage` request to the client/LLM using provided `prompt` and optional generation controls; returns the LLM's response payload.
- `simulate-research-query` (tools/simulate-research-query.ts): Demonstrates MCP Tasks (SEP-1686) with a simulated multi-stage research operation. Accepts `topic` and `ambiguous` parameters. Returns a task that progresses through stages with status updates. If `ambiguous` is true and client supports elicitation, sends an elicitation request directly to gather clarification before completing.
- `trigger-sampling-request-async` (tools/trigger-sampling-request-async.ts): Demonstrates bidirectional tasks where the server sends a sampling request that the client executes as a background task. Server polls for status and retrieves the LLM result when complete. Requires client to support `tasks.requests.sampling.createMessage`.
- `trigger-elicitation-request-async` (tools/trigger-elicitation-request-async.ts): Demonstrates bidirectional tasks where the server sends an elicitation request that the client executes as a background task. Server polls while waiting for user input. Requires client to support `tasks.requests.elicitation.create`.

## Prompts

- `simple-prompt` (prompts/simple.ts): No-argument prompt that returns a static user message.
- `args-prompt` (prompts/args.ts): Two-argument prompt with `city` (required) and `state` (optional) used to compose a question.
- `completable-prompt` (prompts/completions.ts): Demonstrates argument auto-completions with the SDK’s `completable` helper; `department` completions drive context-aware `name` suggestions.
- `resource-prompt` (prompts/resource.ts): Accepts `resourceType` ("Text" or "Blob") and `resourceId` (string convertible to integer) and returns messages that include an embedded dynamic resource of the selected type generated via `resources/templates.ts`.

## Resources

- Dynamic Text: `demo://resource/dynamic/text/{index}` (content generated on the fly)
- Dynamic Blob: `demo://resource/dynamic/blob/{index}` (base64 payload generated on the fly)
- Static Documents: `demo://resource/static/document/<filename>` (serves files from `src/everything/docs/` as static file-based resources)
- Session Scoped: `demo://resource/session/<name>` (per-session resources registered dynamically; available only for the lifetime of the session)

## Resource Subscriptions and Notifications

- Simulated update notifications are opt‑in and off by default.
- Clients may subscribe/unsubscribe to resource URIs using the MCP `resources/subscribe` and `resources/unsubscribe` requests.
- Use the `toggle-subscriber-updates` tool to start/stop a per‑session interval that emits `notifications/resources/updated { uri }` only for URIs that session has subscribed to.
- Multiple concurrent clients are supported; each client’s subscriptions are tracked per session and notifications are delivered independently via the server instance associated with that session.

## Simulated Logging

- Simulated logging is available but off by default.
- Use the `toggle-simulated-logging` tool to start/stop periodic log messages of varying levels (debug, info, notice, warning, error, critical, alert, emergency) per session.
- Clients can control the minimum level they receive via the standard MCP `logging/setLevel` request.

## Tasks (SEP-1686)

The server advertises support for MCP Tasks, enabling long-running operations with status tracking:

- **Capabilities advertised**: `tasks.list`, `tasks.cancel`, `tasks.requests.tools.call`
- **Task Store**: Uses `InMemoryTaskStore` from SDK experimental for task lifecycle management
- **Message Queue**: Uses `InMemoryTaskMessageQueue` for task-related messaging

### Task Lifecycle

1. Client calls `tools/call` with `task: true` parameter
2. Server returns `CreateTaskResult` with `taskId` instead of immediate result
3. Client polls `tasks/get` to check status and receive `statusMessage` updates
4. When status is `completed`, client calls `tasks/result` to retrieve the final result

### Task Statuses

- `working`: Task is actively processing
- `input_required`: Task needs additional input (server sends elicitation request directly)
- `completed`: Task finished successfully
- `failed`: Task encountered an error
- `cancelled`: Task was cancelled by client

### Demo Tools

**Server-side tasks (client calls server):**
Use the `simulate-research-query` tool to exercise the full task lifecycle. Set `ambiguous: true` to trigger elicitation - the server will send an `elicitation/create` request directly and await the response before completing.

**Client-side tasks (server calls client):**
Use `trigger-sampling-request-async` or `trigger-elicitation-request-async` to demonstrate bidirectional tasks where the server sends requests that the client executes as background tasks. These require the client to advertise `tasks.requests.sampling.createMessage` or `tasks.requests.elicitation.create` capabilities respectively.

### Bidirectional Task Flow

MCP Tasks are bidirectional - both server and client can be task executors:

| Direction        | Request Type             | Task Executor | Demo Tool                           |
| ---------------- | ------------------------ | ------------- | ----------------------------------- |
| Client -> Server | `tools/call`             | Server        | `simulate-research-query`           |
| Server -> Client | `sampling/createMessage` | Client        | `trigger-sampling-request-async`    |
| Server -> Client | `elicitation/create`     | Client        | `trigger-elicitation-request-async` |

For client-side tasks:

1. Server sends request with task metadata (e.g., `params.task.ttl`)
2. Client creates task and returns `CreateTaskResult` with `taskId`
3. Server polls `tasks/get` for status updates
4. When complete, server calls `tasks/result` to retrieve the result
