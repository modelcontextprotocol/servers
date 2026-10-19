# Everything Server - Features

**[Architecture](architecture.md)
| [Project Structure](structure.md)
| [Startup Process](startup.md)
| Server Features
| [Extension Points](extension.md)
| [How It Works](how-it-works.md)**

## Protocol eras

The server serves two protocol eras from one process, over stdio and over Streamable HTTP. A client's first message picks its era:

- **2026-07-28** (`modern`): the client opens with `server/discover`, with no `initialize` and no session, and sends its protocol version, identity and capabilities in each request's `_meta`.
- **2025-era** (`legacy`, 2024-10-07 through 2025-11-25): the client opens with the `initialize` handshake. The HTTP+SSE transport serves this era only.

Each feature below is marked **both**, **2026-07-28** or **2025-era**. Roots, sampling and logging are deprecated as of 2026-07-28 (SEP-2577), as is the HTTP+SSE transport; they stay available and are labelled deprecated in their descriptions.

| Feature                                     | 2026-07-28                                                                    | 2025-era                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Discovery                                   | `server/discover`                                                             | `initialize`                                                                    |
| Client input (elicitation, sampling, roots) | in-band: the tool returns `input_required`, the client retries                | the SDK's legacy shim sends real server-to-client requests for the same handler |
| State across rounds                         | `requestState`, signed and expiring                                           | the same, replayed by the shim                                                  |
| Change notifications                        | on a `subscriptions/listen` stream the client opened                          | unsolicited, or after `resources/subscribe`                                     |
| Log level                                   | per request, `_meta` `io.modelcontextprotocol/logLevel` (none named: no logs) | per session, `logging/setLevel`                                                 |
| Tasks                                       | the `io.modelcontextprotocol/tasks` extension                                 | not served                                                                      |
| Cache hints                                 | `ttlMs` / `cacheScope` on lists, reads and `server/discover`                  | not sent                                                                        |
| `x-mcp-header`                              | mirrored into `Mcp-Param-*` headers over Streamable HTTP                      | not mirrored                                                                    |

## Tools

- `echo` (tools/echo.ts), **both**: Echoes the provided `message: string`. Uses Zod to validate inputs.
- `get-annotated-message` (tools/get-annotated-message.ts), **both**: Returns a `text` message annotated with `priority` and `audience` based on `messageType` (`error`, `success`, or `debug`); can optionally include an annotated `image`.
- `get-env` (tools/get-env.ts), **both**: Returns all environment variables from the running process as pretty-printed JSON text.
- `get-header-params` (tools/get-header-params.ts), **both**: Returns its `region` argument and the `Mcp-Param-Region` HTTP header it arrived in. Its input and output schemas are plain JSON Schema 2020-12, and `region` carries `x-mcp-header: "Region"`, so a 2026-07-28 Streamable HTTP client mirrors it into that header and the server refuses a call whose header disagrees with the body (`-32020`). The header is `null` on stdio and for a 2025-era client.
- `get-resource-links` (tools/get-resource-links.ts), **both**: Returns an intro `text` block followed by multiple `resource_link` items. For a requested `count` (1–10), alternates between dynamic Text and Blob resources using URIs from `resources/templates.ts`.
- `get-resource-reference` (tools/get-resource-reference.ts), **both**: Accepts `resourceType` (`text` or `blob`) and `resourceId` (positive integer). Returns a concrete `resource` content block (with its `uri`, `mimeType`, and data) with surrounding explanatory `text`.
- `get-roots-list` (tools/get-roots-list.ts), **both**, deprecated: Asks the client for its roots with a multi-round-trip request (`inputRequired.listRoots()`) and lists them. Needs client capability `roots`.
- `gzip-file-as-resource` (tools/gzip-file-as-resource.ts), **both**: Accepts a `name` and `data` (URL or data URI), fetches the data subject to size/time/domain constraints, compresses it, and returns either a `resource_link` (default) or an inline `resource` depending on `outputType`, with `mimeType: application/gzip`. The linked resource is registered as a session resource at `demo://resource/session/<name>` for a 2025-era client, and stored for ten minutes at a minted `demo://resource/minted/<id>/<name>` for a 2026-07-28 client.
- `get-structured-content` (tools/get-structured-content.ts), **both**: Demonstrates structured responses. Accepts `location` input and returns both backward‑compatible `content` (a `text` block containing JSON) and `structuredContent` validated by an `outputSchema` (temperature, conditions, humidity).
- `get-sum` (tools/get-sum.ts), **both**: For two numbers `a` and `b` calculates and returns their sum. Uses Zod to validate inputs.
- `get-tiny-image` (tools/get-tiny-image.ts), **both**: Returns a tiny PNG MCP logo as an `image` content item with brief descriptive text before and after.
- `simulate-research-query` (tools/simulate-research-query.ts), **2026-07-28**: Runs as a task on the tasks extension. The call returns a task handle; the task works through four stages, one a second, which the client follows with `tasks/get`. With `ambiguous: true` and an elicitation-capable client it pauses at `input_required`, carrying a clarification request the client answers with `tasks/update`. Needs a client that declares the extension.
- `toggle-simulated-logging` (tools/toggle-simulated-logging.ts), **2025-era**, deprecated: Starts or stops simulated, random‑leveled logging for the connection. Respects the level the client set with `logging/setLevel`.
- `toggle-subscriber-updates` (tools/toggle-subscriber-updates.ts), **2025-era**, deprecated: Starts or stops simulated resource update notifications for URIs the connection has subscribed to with `resources/subscribe`.
- `trigger-elicitation-request` (tools/trigger-elicitation-request.ts), **both**: Asks for a form of every field type form-mode elicitation supports (strings, numbers, booleans, enums, and format validation) with a multi-round-trip request, and returns the resulting action/content. Needs client form-mode elicitation: `elicitation.form`, or an `elicitation` object that declares neither mode.
- `trigger-elicitation-request-async` (tools/trigger-elicitation-request-async.ts), **2026-07-28**: Runs as a task whose `input_required` status carries a form elicitation; the client answers with `tasks/update` and the task completes with a summary. Needs a client that declares the tasks extension and form-mode elicitation.
- `trigger-list-changed` (tools/trigger-list-changed.ts), **both**: Sends `notifications/<list>/list_changed` for `tools`, `prompts` or `resources`: on 2026-07-28 to each `subscriptions/listen` stream that asked for that list, on a 2025-era connection unsolicited.
- `trigger-log-messages` (tools/trigger-log-messages.ts), **both**, deprecated: Sends one log message at each level during the call. A 2026-07-28 request gets those at or above the level its `_meta` names (none if it names none); a 2025-era client those at or above its `logging/setLevel` level.
- `trigger-long-running-operation` (tools/trigger-long-running-operation.ts), **both**: Simulates a multi-step operation over a given `duration` and number of `steps`; reports progress via `notifications/progress` when a `progressToken` is provided by the client.
- `trigger-multi-step-elicitation` (tools/trigger-multi-step-elicitation.ts), **both**: Asks for a name, then for a favorite color addressed by that name, carrying the first answer to the second round in `requestState`. The state is HMAC-signed and expires after ten minutes; a tampered or expired one is refused with `-32602`. A blank name or a color that is not a choice is asked again. Needs form-mode elicitation.
- `trigger-resource-update` (tools/trigger-resource-update.ts), **both**: Sends `notifications/resources/updated` for a URI: on 2026-07-28 to each listen stream whose `resourceSubscriptions` name it, on a 2025-era connection once the client has subscribed to it.
- `trigger-sampling-request` (tools/trigger-sampling-request.ts), **both**, deprecated: Asks the client's LLM for a completion with a multi-round-trip request, using the provided `prompt` and `maxTokens`; returns the LLM's response payload. Needs client capability `sampling`.
- `trigger-sampling-request-async` (tools/trigger-sampling-request-async.ts), **2026-07-28**, deprecated: Runs as a task whose `input_required` status carries a sampling request; the client answers with `tasks/update` and the task completes with the result. Needs a client that declares the tasks extension and sampling.
- `trigger-url-elicitation` (tools/trigger-url-elicitation.ts), **both**: Directs the user to a URL (URL-mode elicitation). On 2026-07-28 the elicitation comes in-band (`input_required`), with no `elicitationId`. On a 2025-era connection it issues an `elicitation/create` request in URL mode with an `elicitationId`, or throws MCP error `-32042` (`UrlElicitationRequiredError`) when `errorPath=true`. On the error path the prerequisite elicitation it returns points at a different URL than the failing request (`https://modelcontextprotocol.io`); when the client satisfies it and retries the same call, the retry ignores `errorPath` and proceeds via the request path, so the client does not loop on the same error. The retry marker is one-shot per `(url, elicitationId)` on the connection: it is cleared on the recognized retry, so re-running the error path with identical arguments without an intervening prerequisite is treated as a retry and proceeds. Needs client capability `elicitation.url`.

On a 2025-era connection the tools that need a client capability are registered only for a client that declared it at `initialize`. On 2026-07-28 they are always listed, because the capabilities arrive with each request, and the SDK refuses a call whose embedded request the client did not declare (`-32021`).

## Prompts

- `simple-prompt` (prompts/simple.ts): No-argument prompt that returns a static user message.
- `args-prompt` (prompts/args.ts): Two-argument prompt with `city` (required) and `state` (optional) used to compose a question.
- `completable-prompt` (prompts/completions.ts): Demonstrates argument auto-completions with the SDK’s `completable` helper; `department` completions drive context-aware `name` suggestions.
- `resource-prompt` (prompts/resource.ts): Accepts `resourceType` ("Text" or "Blob") and `resourceId` (string convertible to integer) and returns messages that include an embedded dynamic resource of the selected type generated via `resources/templates.ts`.

## Resources

- Dynamic Text: `demo://resource/dynamic/text/{index}` (content generated on the fly)
- Dynamic Blob: `demo://resource/dynamic/blob/{index}` (base64 payload generated on the fly)
- Static Documents: `demo://resource/static/document/<filename>` (serves files from `src/everything/docs/` as static file-based resources; a 2026-07-28 read carries a one-hour public cache hint)
- Session Scoped, **2025-era**: `demo://resource/session/<name>` (per-session resources registered dynamically; available only for the lifetime of the session)
- Minted, **2026-07-28**: `demo://resource/minted/<id>/<name>` (resources a tool created, under a server-minted id; readable by any client that has the URI, for ten minutes; the process keeps at most 100 of them and 64 MiB of content, dropping the oldest first)

A read of a resource that does not exist (an unknown URI, a template id that is not a positive integer, an expired minted resource) is answered with `-32602` and the URI in the error's `data`.

## Resource Subscriptions and Notifications

- **2026-07-28**: a client opens a `subscriptions/listen` stream whose filter names the notifications it wants (`toolsListChanged`, `promptsListChanged`, `resourcesListChanged`, and `resourceSubscriptions` for per-resource updates). `trigger-list-changed` and `trigger-resource-update` publish onto those streams; over Streamable HTTP, through the handler's subscription bus, so a change made in one request reaches streams other requests opened.
- **2025-era**: clients subscribe and unsubscribe to resource URIs with `resources/subscribe` and `resources/unsubscribe`. `toggle-subscriber-updates` starts or stops a per-connection interval that emits `notifications/resources/updated { uri }` for the URIs that connection subscribed to, and `trigger-resource-update` sends one on demand. List changes arrive unsolicited.
- Each client's subscriptions belong to the server instance serving its connection, so concurrent clients are independent.

## Logging

Logging is deprecated as of 2026-07-28 (SEP-2577) and remains available on both eras.

- **2026-07-28**: a request names its log level in `_meta` (`io.modelcontextprotocol/logLevel`); a request that names none gets no log messages. Use `trigger-log-messages` to see the filter at work.
- **2025-era**: clients set the minimum level for the session with `logging/setLevel`. `toggle-simulated-logging` starts or stops periodic log messages of varying levels (debug, info, notice, warning, error, critical, alert, emergency).

## Tasks

**2026-07-28.** The server implements the server side of the [tasks extension](https://github.com/modelcontextprotocol/ext-tasks) (`io.modelcontextprotocol/tasks`, SEP-2663), advertised under `capabilities.extensions` in `server/discover`. `simulate-research-query`, `trigger-sampling-request-async` and `trigger-elicitation-request-async` answer `tools/call` with a task handle (`resultType: "task"`) for a client that declares the extension, and serve:

- `tasks/get`: the task's status, `statusMessage`, `ttlMs` and `pollIntervalMs`, plus its `inputRequests` while `input_required` and its `result` once `completed`;
- `tasks/update`: the client's `inputResponses` to the outstanding input requests;
- `tasks/cancel`: stop a task that has not finished.

A task tool called by a client whose request does not declare the extension, or the capability its task asks for input with (`sampling` for `trigger-sampling-request-async`, form-mode `elicitation` for `trigger-elicitation-request-async`), is refused with `-32021` (missing required client capability), naming what is missing in `data.requiredCapabilities`; so is a `tasks/*` request from a client without the extension. An unknown or expired task, and a `tasks/update` whose answers exceed 64 KiB serialized, are refused with `-32602`. A `tasks/cancel` is acknowledged whatever the task's status (cancellation is cooperative), and a finished task stays as it ended. An update's answers to requests that are not outstanding (never issued, already answered, or sent while the task is not waiting for input) are ignored, as the extension asks. Each input request a task makes has its own key, never reused once answered, so a request asked again after an answer that does not fit gets a new key (`form-2`, `sampling-2`). The process keeps at most 100 tasks, each until its TTL; at that limit a new task is refused with a tool error. The task id is a server-minted UUID, so a task lives across requests (each 2026-07-28 HTTP request is served by a fresh server instance) and is reached only through its handle. A task's progress is computed from the clock when it is read, so nothing runs in the background.

The 2025-11-25 core task methods (`tasks/result`, `tasks/list`, task-augmented requests) are not served: SDK v2 removed the experimental layer they were built on.
