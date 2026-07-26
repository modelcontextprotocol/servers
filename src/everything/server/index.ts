import type { McpRequestContext } from "@modelcontextprotocol/server";
import { McpServer } from "@modelcontextprotocol/server";
import {
  setSubscriptionHandlers,
  stopSimulatedResourceUpdates,
} from "../resources/subscriptions.js";
import { registerTools } from "../tools/index.js";
import { registerResources, readInstructions } from "../resources/index.js";
import { registerPrompts } from "../prompts/index.js";
import { stopSimulatedLogging } from "./logging.js";
import { requestStateCodec } from "./request-state.js";
import { syncRoots } from "./roots.js";

/**
 * Server Factory
 *
 * Builds one `McpServer` for a single serving unit -- one HTTP request under
 * `createMcpHandler`, or one connection under `serveStdio` -- and registers the
 * full tool / resource / prompt surface on it.
 *
 * The same factory backs **both protocol eras**. Tools, resources and prompts
 * are defined once; the serving entry decides which era the instance serves and
 * the SDK adapts the wire behavior. `ctx.era` is only consulted for the handful
 * of things that genuinely cannot exist on one era or the other.
 *
 * ## "legacy" and "modern"
 *
 * These are the SDK's own era names -- the literal values of `ctx.era`
 * (`ProtocolEra = 'legacy' | 'modern'`), used throughout this server:
 *
 * - **legacy** -- protocol revisions `2024-10-07` through `2025-11-25`.
 *   `initialize` handshake, sessions, server->client requests, unsolicited
 *   notifications.
 * - **modern** -- `2026-07-28` and later. No handshake and no sessions: every
 *   request carries its own protocol version, client identity and capabilities
 *   in `_meta`. Server->client requests are replaced by multi-round-trip
 *   `inputRequired(...)` returns, and change notifications by
 *   `subscriptions/listen`.
 *
 * The split is architectural, not chronological -- the SDK's constant is
 * `FIRST_MODERN_PROTOCOL_VERSION`, so later revisions join the modern era
 * rather than starting a third one.
 *
 * @param ctx Construction context from the serving entry: the `era` this
 * instance will serve, and (HTTP only) validated `authInfo`.
 */
export const createServer = (ctx?: McpRequestContext): McpServer => {
  // Read the server instructions
  const instructions = readInstructions();

  const server = new McpServer(
    {
      name: "mcp-servers/everything",
      title: "Everything Reference Server",
      version: "2.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
        prompts: {
          listChanged: true,
        },
        resources: {
          subscribe: true,
          listChanged: true,
        },
        logging: {},
      },
      instructions,
      // Verify the HMAC seal on every echoed `requestState` before a handler
      // is entered. The seam runs this on each multi-round-trip round -- on
      // both eras, since the legacy shim mirrors the modern driver exactly --
      // and answers a rejection with the frozen `-32602`.
      requestState: { verify: requestStateCodec.verify },
      // Advertise a real cache policy for the 2026-07-28 `CacheableResult`
      // fields. Without this the SDK emits the most conservative possible
      // default (`ttlMs: 0`, `cacheScope: "private"`) on every cacheable
      // result. The listing surfaces are static for the process lifetime, so
      // they are safe to cache briefly and safe to share. `resources/read` is
      // deliberately absent -- several of this server's resources are
      // intentionally dynamic. These fields never appear on legacy-era responses.
      cacheHints: {
        "tools/list": { ttlMs: 60_000, cacheScope: "public" },
        "prompts/list": { ttlMs: 60_000, cacheScope: "public" },
        "resources/list": { ttlMs: 60_000, cacheScope: "public" },
        "resources/templates/list": { ttlMs: 60_000, cacheScope: "public" },
        "server/discover": { ttlMs: 60_000, cacheScope: "public" },
      },
    }
  );

  // Register the full surface. Note there is no longer a "conditional tools"
  // pass gated on client capabilities: the tools that need elicitation /
  // sampling / roots return `inputRequired(...)`, and the SDK refuses the
  // embedded request with `-32021 MissingRequiredClientCapabilityError` when
  // the caller did not declare the capability. That gate runs at dispatch on
  // BOTH eras, so registration no longer has to wait for `initialize` -- which
  // is what made the old `oninitialized` hook necessary, and which does not
  // exist on 2026-07-28 at all.
  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  // `resources/subscribe` / `resources/unsubscribe` are legacy-era only. They are
  // physically absent from the 2026-07-28 method registry, so registering the
  // handlers unconditionally is harmless -- an inbound `resources/subscribe` on
  // a modern connection gets `-32601` regardless. Modern clients use
  // `subscriptions/listen`, which the serving entry handles itself.
  setSubscriptionHandlers(server);

  // Roots on the legacy era are pulled with a server->client `roots/list` request
  // after initialization. That channel does not exist on 2026-07-28 -- there the
  // `get-roots-list` tool asks for roots via `inputRequired(...)` instead. So
  // this hook is legacy-only.
  if (ctx?.era !== "modern") {
    server.server.oninitialized = () => {
      // Delayed: a `roots/list` issued from inside the
      // `notifications/initialized` handler is lost before the client is ready
      // to answer it.
      const sessionId = server.server.transport?.sessionId;
      setTimeout(() => void syncRoots(server, sessionId), 350);
    };
  }

  return server;
};

/**
 * Release process-level simulation state for a session that has ended.
 *
 * Only meaningful where a session exists -- a stdio connection, or a legacy-era
 * Streamable HTTP session. Modern-era HTTP serving is per request and holds
 * nothing between exchanges.
 *
 * @param sessionId The ending session, or `undefined` for stdio.
 */
export const cleanupSession = (sessionId?: string): void => {
  stopSimulatedLogging(sessionId);
  stopSimulatedResourceUpdates(sessionId);
};
