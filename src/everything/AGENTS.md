# MCP "Everything" Server - Development Guidelines

## Build, Test & Run Commands

- Build: `npm run build` - Compiles TypeScript to JavaScript
- Watch mode: `npm run watch` - Watches for changes and rebuilds automatically
- Run STDIO server: `npm run start:stdio` - Starts the MCP server using stdio transport
- Run SSE server: `npm run start:sse` - Starts the MCP server with SSE transport
- Run StreamableHttp server: `npm run start:stremableHttp` - Starts the MCP server with StreamableHttp transport
- Prepare release: `npm run prepare` - Builds the project for publishing

## Code Style Guidelines

- Use ES modules with `.js` extension in import paths
- Strictly type all functions and variables with TypeScript
- Follow zod schema patterns for tool input validation
- Prefer async/await over callbacks and Promise chains
- Place all imports at top of file, grouped by external then internal
- Use descriptive variable names that clearly indicate purpose
- Implement proper cleanup for timers and resources in server shutdown
- Handle errors with try/catch blocks and provide clear error messages
- Use consistent indentation (2 spaces) and trailing commas in multi-line objects
- Match existing code style, import order, and module layout in the respective folder.
- Use camelCase for variables/functions,
- Use PascalCase for types/classes,
- Use UPPER_CASE for constants
- Use kebab-case for file names and registered tools, prompts, and resources.
- Use verbs for tool names, e.g., `get-annotated-message` instead of `annotated-message`

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
  `server/index.ts` and usages in `logging.ts` and `subscriptions.ts`.
- Keep the docs in `src/everything/docs/` up to date if you add or modify noteworthy features.
