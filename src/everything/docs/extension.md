# Everything Server - Extension Points

**[Architecture](architecture.md)
| [Project Structure](structure.md)
| [Startup Process](startup.md)
| [Server Features](features.md)
| Extension Points
| [How It Works](how-it-works.md)**

## Adding Tools

- Create a new file under `tools/` with your `registerXTool(server)` function that registers the tool via `server.registerTool(...)`. Take the `context` (`server/context.ts`) as a second argument if the tool needs the protocol era, the change publisher, or state that lives as long as the connection.
- Export and call it from `tools/index.ts`, in the function for the eras that get it: `registerTools(server, context)` for both, `registerModernTools` for 2026-07-28 only, `registerLegacyTools` or `registerConditionalTools` (capability-gated) for the 2025 era only.
- Never keep state in a module-level map keyed by session id: the 2026-07-28 protocol has no sessions, and its HTTP path builds a fresh server per request. Keep per-connection state in the registration closure, and state that must outlive a request under a handle the server mints (as `server/tasks.ts` and `resources/minted.ts` do).
- For client input (elicitation, sampling, roots), return `inputRequired(...)` from the handler rather than sending a request; the SDK's legacy shim serves the same handler to 2025-era clients.

## Adding Prompts

- Create a new file under `prompts/` with your `registerXPrompt(server)` function that registers the prompt via `server.registerPrompt(...)`.
- Export and call it from `prompts/index.ts` inside `registerPrompts(server)`.

## Adding Resources

- Create a new file under `resources/` with your `registerXResources(server)` function using `server.registerResource(...)` (optionally with `ResourceTemplate`).
- Export and call it from `resources/index.ts` inside `registerResources(server, context)`.
