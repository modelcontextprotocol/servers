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
- `trigger-sampling-request` (tools/trigger-sampling-request.ts): Issues a `sampling/createMessage` request to the client/LLM using provided `prompt` and optional generation controls; returns the LLM’s response payload.

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
