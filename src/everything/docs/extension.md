# Everything Server - Extension Points

**[Architecture](architecture.md)
| [Project Structure](structure.md)
| [Startup Process](startup.md)
| [Server Features](features.md)
| Extension Points
| [How It Works](how-it-works.md)**

## Adding Tools

- Create a new file under `tools/` with your `registerXTool(server)` function that registers the tool via `server.registerTool(...)`.
- Export and call it from `tools/index.ts` inside `registerTools(server)`.
- Register **unconditionally**. Do not gate registration on client capabilities: on
  2026-07-28 the factory never learns them (they arrive per request in `_meta`), and
  `tools/list` may not vary per connection. The SDK refuses a caller lacking a required
  capability at dispatch with `-32021`.

### Tools that need input from the client

Never push a server-to-client request — that channel does not exist on 2026-07-28.
**Return** `inputRequired(...)` and let the client answer:

```ts
const answer = inputResponse(ctx.mcpReq.inputResponses, "confirm");
if (answer.kind === "missing") {
  return inputRequired({
    inputRequests: {
      confirm: inputRequired.elicit({ message: "Proceed?", requestedSchema: { … } }),
    },
  });
}
// re-entry: answer.kind is "elicit" | "sampling" | "roots"
```

Write this once — the SDK's legacy shim serves the same return to legacy-era clients as
real server-to-client requests. Builders: `inputRequired.elicit`,
`.elicitUrl`, `.createMessage`, `.listRoots`. Read answers with `inputResponse(...)` for
the discriminated view, or `acceptedContent(responses, key, schema)` for validated,
typed elicitation content.

If your flow needs **more than one round**, remember `inputResponses` are per round:
carry anything else forward in `requestState`, minted with the shared codec in
`server/request-state.ts`. See `tools/simulate-research-query.ts` for the phase-switch
pattern.

### Notifications from a tool

Use `ctx.mcpReq.notify(...)` for anything scoped to the current request (progress,
logs) so it rides that request's own response stream. For change notifications
(`*ListChanged`, `resources/updated`), publish through `getNotifier(server)` rather than
the instance, so it works under both serving entries.

## Adding Prompts

- Create a new file under `prompts/` with your `registerXPrompt(server)` function that registers the prompt via `server.registerPrompt(...)`.
- Export and call it from `prompts/index.ts` inside `registerPrompts(server)`.

## Adding Resources

- Create a new file under `resources/` with your `registerXResources(server)` function using `server.registerResource(...)` (optionally with `ResourceTemplate`).
- Export and call it from `resources/index.ts` inside `registerResources(server)`.
