# MCP "Everything" Server - Development Guidelines

## Build, Test & Run Commands

- Build: `npm run build` - Compiles TypeScript to JavaScript
- Watch mode: `npm run watch` - Watches for changes and rebuilds automatically
- Run STDIO server: `npm run start:stdio` - Starts the MCP server using stdio transport
- Run SSE server: `npm run start:sse` - Starts the MCP server with SSE transport
- Run StreamableHttp server: `npm run start:streamableHttp` - Starts the MCP server with StreamableHttp transport
- Prepare release: `npm run prepare` - Builds the project for publishing

## Code style

The repo-wide TypeScript, naming and MCP rules are in the root
[`AGENTS.md`](../../AGENTS.md), which is loaded in every session. This file holds
only what is specific to this server, and is loaded when a file in this
directory is read. Beyond the root rules:

- Match the existing code style, import order and module layout of the folder
  you are working in.
- Use kebab-case for file names and for registered tools, prompts and resources
  (e.g. `get-annotated-message`, not `annotated-message`).

## Extending the Server

The Everything Server is designed to be extended at well-defined points.
See [Extension Points](docs/extension.md) and [Project Structure](docs/structure.md).
The server factory is `src/everything/server/index.ts` and registers all features during startup as well as handling post-connection setup.

### High-level

- Tools live under `src/everything/tools/` and are registered via `registerTools(server)`.
- Resources live under `src/everything/resources/` and are registered via `registerResources(server)`.
- Prompts live under `src/everything/prompts/` and are registered via `registerPrompts(server)`.
- Subscriptions and simulated update routines are under `src/everything/resources/subscriptions.ts`.
- Logging helpers are under `src/everything/server/logging.ts`.
- Transport managers are under `src/everything/transports/`.

### When adding a new feature

- Follow the existing file/module pattern in its folder (naming, exports, and registration function).
- Export a `registerX(server)` function that registers new items with the MCP SDK in the same style as existing ones.
- Wire your new module into the central index (e.g., update `tools/index.ts`, `resources/index.ts`, or `prompts/index.ts`).
- Ensure schemas (for tools) are accurate JSON Schema and include helpful descriptions and examples.
- Keep the docs in `src/everything/docs/` up to date if you add or modify noteworthy features.
