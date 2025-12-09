# Everything Server – Architecture and Layout

This document summarizes the current layout and runtime architecture of the `src/everything` package. It explains how the server starts, how transports are wired, where tools, prompts, and resources are registered, and how to extend the system.

## High‑level Overview

- Purpose: A minimal, modular MCP server showcasing core Model Context Protocol features. It exposes a simple tool, several prompts, and both static and dynamic resources, and can be run over multiple transports (STDIO, SSE, and Streamable HTTP).
- Design: A small “server factory” constructs the MCP server and registers features. Transports are separate entry points that create/connect the server and handle network concerns. Tools, prompts, and resources are organized in their own submodules.
- Design: A small “server factory” constructs the MCP server and registers features. Transports are separate entry points that create/connect the server and handle network concerns. Tools, prompts, and resources are organized in their own submodules. Simulated logging and resource‑update notifications are opt‑in and controlled by tools.
- Two server implementations exist:

  - `server/index.ts`: The lightweight, modular server used by transports in this package.
  - `server/everything.ts`: A comprehensive reference server (much larger, many tools/prompts/resources) kept for reference/testing but not wired up by default in the entry points.

- Multi‑client subscriptions: The server supports multiple concurrent clients. Each client manages its own resource subscriptions and receives notifications only for the URIs it subscribed to, independent of other clients.

## Directory Layout

```
src/everything
├── index.ts
├── server
│   ├── index.ts
│   ├── logging.ts
│   └── everything.ts
├── transports
│   ├── sse.ts
│   ├── stdio.ts
│   └── streamableHttp.ts
├── tools
│   ├── index.ts
│   ├── annotated-message.ts
│   ├── add.ts
│   ├── echo.ts
│   ├── get-tiny-image.ts
│   ├── long-running-operation.ts
│   ├── print-env.ts
│   ├── sampling-request.ts
│   ├── toggle-logging.ts
│   └── toggle-subscriber-updates.ts
├── prompts
│   ├── index.ts
│   ├── args.ts
│   ├── completions.ts
│   ├── simple.ts
│   └── resource.ts
├── resources
│   ├── index.ts
│   ├── files.ts
│   ├── subscriptions.ts
│   └── templates.ts
├── docs
│   ├── architecture.md
│   └── server-instructions.md
└── package.json
```

At `src/everything`:

- index.ts

  - CLI entry that selects and runs a specific transport module based on the first CLI argument: `stdio`, `sse`, or `streamableHttp`.

- server/

  - index.ts
    - Server factory that creates an `McpServer` with declared capabilities, loads server instructions, and registers tools, prompts, and resources.
    - Sets resource subscription handlers via `setSubscriptionHandlers(server)`.
    - Exposes `{ server, cleanup }` to the chosen transport. Cleanup stops any running intervals in the server when the transport disconencts.
  - logging.ts
    - Implements simulated logging. Periodically sends randomized log messages at various levels to the connected client session. Started/stopped on demand via a dedicated tool.
  - everything.ts
    - A full “reference/monolith” implementation demonstrating most MCP features. Not the default path used by the transports in this package.

- transports/

  - stdio.ts
    - Starts a `StdioServerTransport`, created the server via `createServer()`, and connects it. Handles `SIGINT` to close cleanly and calls `cleanup()` to remove any live intervals.
  - sse.ts
    - Express server exposing:
      - `GET /sse` to establish an SSE connection per session.
      - `POST /message` for client messages.
    - Manages multiple connected clients via a transport map.
    - Starts an `SSEServerTransport`, created the server via `createServer()`, and connects it to a new transport.
    - On server disconnect, calls `cleanup()` to remove any live intervals.
  - streamableHttp.ts
    - Express server exposing a single `/mcp` endpoint for POST (JSON‑RPC), GET (SSE stream), and DELETE (session termination) using `StreamableHTTPServerTransport`.
    - Uses an `InMemoryEventStore` for resumable sessions and tracks transports by `sessionId`. Connects a fresh server instance on initialization POST and reuses the transport for subsequent requests.

- tools/

  - index.ts
    - `registerTools(server)` orchestrator; delegates to basic tools and control tools.
    - add.ts
      - Registers an `add` tool with a Zod input schema that sums two numbers `a` and `b` and returns the result.
    - annotated-message.ts
        - Registers an `annotated-message` tool which demonstrates annotated content items by emitting a primary `text` message with `annotations` that vary by `messageType` (`"error" | "success" | "debug"`), and optionally includes an annotated `image` (tiny PNG) when `includeImage` is true.
    - echo.ts
      - Registers an `echo` tool that takes a message and returns `Echo: {message}`.
    - get-tiny-image.ts
      - Registers a `get-tiny-image` tool, which returns a tiny PNG MCP logo as an `image` content item, along with surrounding descriptive `text` items.
    - long-running-operation.ts
      - Registers a `long-running-operation` tool that simulates a long-running task over a specified `duration` (seconds) and number of `steps`; emits `notifications/progress` updates when the client supplies a `progressToken`.
    - print-env.ts
      - Registers a `print-env` tool that returns the current process environment variables as formatted JSON text; useful for debugging configuration.
    - sampling-request.ts
        - Registers a `sampling-request` tool that sends a `sampling/createMessage` request to the client/LLM and returns the sampling result.
    - toggle-logging.ts
      - Registers a `toggle-logging` tool, which starts or stops simulated logging for the invoking session.
    - toggle-subscriber-updates.ts
      - Registers a `toggle-subscriber-updates` tool, which starts or stops simulated resource subscription update checks for the invoking session.

- prompts/

  - index.ts
    - `registerPrompts(server)` orchestrator; delegates to individual prompt registrations.
  - simple.ts
    - Registers `simple-prompt`: a prompt with no arguments that returns a single user message.
  - args.ts
    - Registers `args-prompt`: a prompt with two arguments (`city` required, `state` optional) used to compose a message.
  - completions.ts
    - Registers `completable-prompt`: a prompt whose arguments support server-driven completions using the SDK’s `completable(...)` helper (e.g., completing `department` and context-aware `name`).
  - resource.ts
    - Exposes `registerEmbeddedResourcePrompt(server)` which registers `resource-prompt` — a prompt that accepts `resourceType` ("Text" or "Blob") and `resourceId` (integer), and embeds a dynamically generated resource of the requested type within the returned messages. Internally reuses helpers from `resources/templates.ts`.

- resources/

  - index.ts
    - `registerResources(server)` orchestrator; delegates to template‑based dynamic resources and static file-based resources by calling `registerResourceTemplates(server)` and `registerFileResources(server)`.
  - templates.ts
    - Registers two dynamic, template‑driven resources using `ResourceTemplate`:
      - Text: `demo://resource/dynamic/text/{index}` (MIME: `text/plain`)
      - Blob: `demo://resource/dynamic/blob/{index}` (MIME: `application/octet-stream`, Base64 payload)
    - The `{index}` path variable must be a finite integer. Content is generated on demand with a timestamp.
    - Exposes helpers `textResource(uri, index)`, `textResourceUri(index)`, `blobResource(uri, index)`, and `blobResourceUri(index)` so other modules can construct and embed dynamic resources directly (e.g., from prompts).
  - files.ts
    - Registers static file-based resources for each file in the `docs/` folder.
    - URIs follow the pattern: `demo://resource/static/document/<filename>`.
    - Serves markdown files as `text/markdown`, `.txt` as `text/plain`, `.json` as `application/json`, others default to `text/plain`.

- docs/

  - server-instructions.md
    - Human‑readable instructions intended to be passed to the client/LLM as MCP server instructions. Loaded by the server at startup.
  - architecture.md (this document)

- package.json
  - Package metadata and scripts:
    - `build`: TypeScript compile to `dist/`, copies `docs/` into `dist/` and marks the compiled entry scripts as executable.
    - `start:stdio`, `start:sse`, `start:streamableHttp`: Run built transports from `dist/`.
  - Declares dependencies on `@modelcontextprotocol/sdk`, `express`, `cors`, `zod`, etc.

## Startup and Runtime Flow

1. A transport is chosen via the CLI entry `index.ts`:

   - `node dist/index.js stdio` → loads `transports/stdio.js`
   - `node dist/index.js sse` → loads `transports/sse.js`
   - `node dist/index.js streamableHttp` → loads `transports/streamableHttp.js`

2. The transport creates the server via `createServer()` from `server/index.ts` and connects it to the chosen transport type from the MCP SDK.

3. The server factory (`server/index.ts`) does the following:

   - Creates `new McpServer({ name, title, version }, { capabilities, instructions })`.
   - Capabilities:
     - `tools: {}`
     - `logging: {}`
     - `prompts: {}`
     - `resources: { subscribe: true }`
   - Loads human‑readable “server instructions” from the docs folder (`server-instructions.md`).
   - Registers tools via `registerTools(server)`.
   - Registers resources via `registerResources(server)`.
   - Registers prompts via `registerPrompts(server)`.
   - Sets up resource subscription handlers via `setSubscriptionHandlers(server)`.
   - Returns the server and a `cleanup(sessionId?)` hook that stops any active intervals and removes any session‑scoped state.

4. Each transport is responsible for network/session lifecycle:
   - STDIO: simple process‑bound connection; closes on `SIGINT` and calls `cleanup()`.
   - SSE: maintains a session map keyed by `sessionId`; hooks server’s `onclose` to clean and remove session; exposes `/sse` (GET) and `/message` (POST) endpoints.
   - Streamable HTTP: exposes `/mcp` for POST (JSON‑RPC messages), GET (SSE stream), and DELETE (termination). Uses an event store for resumability and stores transports by `sessionId`. Does not auto‑start simulated features; calls `cleanup(sessionId)` on DELETE.

## Registered Features (current minimal set)

- Tools

  - `add` (tools/add.ts): Adds two numbers `a` and `b` and returns their sum. Uses Zod to validate inputs.
  - `annotated-message` (tools/annotated-message.ts): Returns a `text` message annotated with `priority` and `audience` based on `messageType` (`error`, `success`, or `debug`); can optionally include an annotated `image`.
  - `echo` (tools/echo.ts): Echoes the provided `message: string`. Uses Zod to validate inputs.
  - `get-tiny-image` (tools/get-tiny-image.ts): Returns a tiny PNG MCP logo as an `image` content item with brief descriptive text before and after.
  - `long-running-operation` (tools/long-running-operation.ts): Simulates a multi-step operation over a given `duration` and number of `steps`; reports progress via `notifications/progress` when a `progressToken` is provided by the client.
  - `print-env` (tools/print-env.ts): Returns all environment variables from the running process as pretty-printed JSON text.
  - `sampling-request` (tools/sampling-request.ts): Issues a `sampling/createMessage` request to the client/LLM using provided `prompt` and optional generation controls; returns the LLM’s response payload.
  - `toggle-logging` (tools/toggle-logging.ts): Starts or stops simulated, random‑leveled logging for the invoking session. Respects the client’s selected minimum logging level.
  - `toggle-subscriber-updates` (tools/toggle-subscriber-updates.ts): Starts or stops simulated resource update notifications for URIs the invoking session has subscribed to.

- Prompts

  - `simple-prompt` (prompts/simple.ts): No-argument prompt that returns a static user message.
  - `args-prompt` (prompts/args.ts): Two-argument prompt with `city` (required) and `state` (optional) used to compose a question.
  - `completable-prompt` (prompts/completions.ts): Demonstrates argument auto-completions with the SDK’s `completable` helper; `department` completions drive context-aware `name` suggestions.
  - `resource-prompt` (prompts/resource.ts): Accepts `resourceType` ("Text" or "Blob") and `resourceId` (string convertible to integer) and returns messages that include an embedded dynamic resource of the selected type generated via `resources/templates.ts`.

- Resources

  - Dynamic Text: `demo://resource/dynamic/text/{index}` (content generated on the fly)
  - Dynamic Blob: `demo://resource/dynamic/blob/{index}` (base64 payload generated on the fly)
  - Static Docs: `demo://resource/static/document/<filename>` (serves files from `src/everything/docs/` as static file-based resources)

- Resource Subscriptions and Notifications

  - Clients may subscribe/unsubscribe to resource URIs using the MCP `resources/subscribe` and `resources/unsubscribe` requests.
  - Simulated update notifications are opt‑in and off by default. Use the `toggle-subscriber-updates` tool to start/stop a per‑session interval that emits `notifications/resources/updated { uri }` only for URIs that session has subscribed to.
  - Multiple concurrent clients are supported; each client’s subscriptions are tracked per session and notifications are delivered independently via the server instance associated with that session.

- Logging
  - Simulated logging is available but off by default. Use the `toggle-logging` tool to start/stop periodic log messages of varying levels (debug, info, notice, warning, error, critical, alert, emergency) per session. Clients can control the minimum level they receive via the standard MCP `logging/setLevel` request.

## Extension Points

- Adding Tools

  - Create a new file under `tools/` with your `registerXTool(server)` function that registers the tool via `server.registerTool(...)`.
  - Export and call it from `tools/index.ts` inside `registerTools(server)`.

- Adding Prompts

  - Create a new file under `prompts/` with your `registerXPrompt(server)` function that registers the prompt via `server.registerPrompt(...)`.
  - Export and call it from `prompts/index.ts` inside `registerPrompts(server)`.

- Adding Resources

  - Create a new file under `resources/` with your `registerXResources(server)` function using `server.registerResource(...)` (optionally with `ResourceTemplate`).
  - Export and call it from `resources/index.ts` inside `registerResources(server)`.

## Resource Subscriptions – How It Works

- Module: `resources/subscriptions.ts`

  - Tracks subscribers per URI: `Map<uri, Set<sessionId>>`.
  - Installs handlers via `setSubscriptionHandlers(server)` to process subscribe/unsubscribe requests and keep the map updated.
  - Updates are started/stopped on demand by the `toggle-subscriber-updates` tool, which calls `beginSimulatedResourceUpdates(server, sessionId)` and `stopSimulatedResourceUpdates(sessionId)`.
  - `cleanup(sessionId?)` calls `stopSimulatedResourceUpdates(sessionId)` to clear intervals and remove session‑scoped state.

- Design note: Each client session has its own `McpServer` instance; periodic checks run per session and invoke `server.notification(...)` on that instance, so messages are delivered only to the intended client.

## Simulated Logging – How It Works

- Module: `server/logging.ts`

  - Periodically sends randomized log messages at different levels. Messages can include the session ID for clarity during demos.
  - Started/stopped on demand via the `toggle-logging` tool, which calls `beginSimulatedLogging(server, sessionId?)` and `stopSimulatedLogging(sessionId?)`. Note that transport disconnect triggers `cleanup()` which also stops any active intervals.
  - Uses `server.sendLoggingMessage({ level, data }, sessionId?)` so that the client’s configured minimum logging level is respected by the SDK.

- Adding Transports
  - Implement a new transport module under `transports/`.
  - Add a case to `index.ts` so the CLI can select it.

## Build and Distribution

- TypeScript sources are compiled into `dist/` via `npm run build`.
- The `build` script copies `docs/` into `dist/` so instruction files ship alongside the compiled server.
- The CLI bin is configured in `package.json` as `mcp-server-everything` → `dist/index.js`.

## Relationship to the Full Reference Server

The large `server/everything.ts` shows a comprehensive MCP server showcasing many features (tools with schemas, prompts, resource operations, notifications, etc.). The current transports in this package use the lean factory from `server/index.ts` instead, keeping the runtime small and focused while preserving the reference implementation for learning and experimentation.
