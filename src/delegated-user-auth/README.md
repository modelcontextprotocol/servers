# Delegated End-User Context — Reference Example

A well-commented TypeScript reference implementation of the MCP extension
`io.modelcontextprotocol/delegated-end-user-context`, specified in
[`delegated-user-auth.md`](../../delegated-user-auth.md) (Status: Draft, SEP-XXXX).

> **Resource scopes are NOT MCP resources.** They are opaque data/field-level
> permission labels that the server uses to filter which fields a tool returns at a
> given verification level. Real MCP `resources/list` and `resources/read` are
> gated separately by verification level (see `server.ts`).

## Why identity lives in `_meta`, not tool arguments

The connector (e.g. a customer support agent) authenticates the _channel_ with a
broad OAuth token that can access any user's data. Per-user authorization must
therefore come from the asserted `_meta` identity — **never** from a tool
argument. A tool that took `userId` as an argument would be a confused-deputy: the
caller could ask for anyone's data. The extension solves this by requiring the
client to attach a signed JWT and verification level in `_meta` on every request,
so the server always knows _who_ the end user is and _how confident_ the client is
in that identity.

## Policy narrowing (intersection, never widening)

The server advertises a `defaultPolicies` catalog: which tools are available at
each verification level and what resource scopes they expose. The client (or the
customer configuring it) can **narrow** these policies via `policyOverrides` but
can **never widen** them.

| Case                              | Default scopes          | Override scopes            | Effective scopes        |
| --------------------------------- | ----------------------- | -------------------------- | ----------------------- |
| No override                       | `["summary", "detail"]` | —                          | `["summary", "detail"]` |
| Subset                            | `["summary", "detail"]` | `["summary"]`              | `["summary"]`           |
| Foreign scope (ignored)           | `["summary", "detail"]` | `["summary", "financial"]` | `["summary"]`           |
| `enabled: false`                  | tool present            | —                          | tool removed            |
| `enabled: false` on never-granted | tool absent             | —                          | no-op                   |

See `policy.ts` → `intersectPolicies`.

## Issuer trust

Per the spec, the **client advertises** `issuer: { name, jwksUri }` in its
extension capabilities, and the server anchors JWT `iss`/JWKS trust to that
negotiated value.

**This reference server requires a server-owned `trustedIssuers` allowlist.**
Each entry binds an accepted issuer **name to a server-approved JWKS URI**. At
initialize, the client's advertised `issuer.name` must match a configured entry
_and_ the advertised `jwksUri` must equal that entry's approved URI — a mismatch
on either rejects initialization. The server then anchors trust to the
**configured** JWKS URI, never a client-chosen one. This closes the attack where
a malicious client advertises a trusted name pointed at a key set it controls and
mints its own `verified` assertions.

## Reconnecting and list changes

The client **re-polls `tools/list`** when the verification level changes; there
is no `list_changed` notification for per-user level changes (`listChanged` is
server-wide only). Reconnecting to renegotiate policies requires a **fresh
connection** — the SDK won't re-initialize an existing one.

## Error taxonomy

Two kinds of failure, and which one you use is not arbitrary:

- **Protocol-shape / auth-layer problems → JSON-RPC errors:**

  - `-32001` Missing required end-user context (extension negotiated but `_meta` absent)
  - `-32002` Invalid or expired assertion (`data.reason`: `assertion_missing`, `assertion_expired`, `assertion_invalid`)
  - `-32003` Unsupported user ID scheme (`data.scheme` + `data.supportedSchemes`)
  - `-32602` Invalid params (standard JSON-RPC/MCP code): malformed `_meta` context, malformed initialize params, malformed tool arguments, unsupported verification level, or unknown/below-level resource URI (`data.reason` distinguishes these)

- **Policy / authorization outcomes → `isError` results** (only on `tools/call`):
  - Tool not allowed at this verification level
  - Cross-user data access or data not found — one generic, non-leaking result

## Safe logging

Assertions are bearer credentials and are redacted before printing. The demo
(`demo.ts`) runs every request's `_meta` through `redactContext` so the JWT is
never printed. Error output shows only safe details (Zod issue paths + messages,
never raw values).

## Running

```bash
npm ci && npm run build && npm test
node dist/index.js
```

The demo prints a phase-by-phase walkthrough of the extension lifecycle:

1. **Phase 1** — First connect, no overrides → effective == default policies
2. **Phase 2** — New trio with `JANE_OVERRIDES` → `claimed.lookup_orders` narrowed to summary only
3. **Phase 3** — Anonymous `tools/list` (1 tool) + `search_knowledge_base`
4. **Phase 4** — Claimed `tools/list` (2 tools) + `lookup_orders` → summary only
5. **Phase 5** — Verified: mint JWT → `lookup_orders` (summary + detail + financial) + `initiate_return`
6. **Phase 6** — Error scenarios (missing context, tool not allowed, cross-user, expired JWT, unknown level, widening, non-negotiated)
7. **Phase 7** — Two users back-to-back over one connection → different data, no session state

## Files

| File           | Purpose                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `extension.ts` | Shared wire contract: extension key, constants, Zod schemas, error builders, `redactContext`                  |
| `policy.ts`    | Frozen `DEFAULT_POLICIES` catalog + pure `intersectPolicies` (never widens)                                   |
| `data.ts`      | Fake user data, identity canonicalization (`canonicalize`/`splitOidc`), scope→field projection (`pickScopes`) |
| `jwt.ts`       | In-repo IdP (`jose`): `mintAssertion` with test overrides, `verifyAssertion` with typed `AssertionError`      |
| `server.ts`    | Low-level `Server`: override-initialize, `authorizeRequest`, all handlers                                     |
| `client.ts`    | Agent-platform client: `createClient`, `JANE_OVERRIDES`, `buildMeta`, `_meta`-injecting wrappers              |
| `demo.ts`      | `InMemoryTransport` walkthrough, phases 1–7, `createRecordingTransport`                                       |
| `index.ts`     | Launcher                                                                                                      |
