// The everything server's factory: builds one fully registered `McpServer`
// for the protocol era it is asked to serve (#4852).
//
// One factory backs every transport and both eras. `serveStdio` calls it once
// per stdio connection; the Streamable HTTP transport calls it once per
// 2025-era session and once per 2026-07-28 request; the SSE transport once
// per (2025-era) connection. Everything that must outlive a single call lives
// on the instance it builds, in the context below, never in a map keyed by a
// session id: the 2026-07-28 revision has no sessions.
//
// What differs by era is wired here, in one place:
// - 2025-era: the client's capabilities arrive in `initialize`, so the tools
//   that need a client capability are registered once it has initialized, and
//   the roots list is synced then. The features the 2026-07-28 revision
//   removes (`logging/setLevel`-paced simulated logging, `resources/subscribe`
//   timed updates) are registered here only, labelled deprecated.
// - 2026-07-28: there is no `initialize`, and each request carries the
//   client's capabilities in its `_meta`, so the capability-gated tools are
//   registered up front and the SDK refuses an embedded request the client
//   did not declare (-32021). The tasks extension is served here only.

import {
  createRequestStateCodec,
  McpServer,
  type CacheHint,
} from "@modelcontextprotocol/server";
import { setSubscriptionHandlers } from "../resources/subscriptions.js";
import {
  registerConditionalTools,
  registerLegacyTools,
  registerModernTools,
  registerTools,
} from "../tools/index.js";
import { registerResources, readInstructions } from "../resources/index.js";
import { registerPrompts } from "../prompts/index.js";
import {
  guardTaskTools,
  registerTasksExtension,
  TASKS_EXTENSION,
} from "./tasks.js";
import { syncRoots } from "./roots.js";
import {
  instancePublisher,
  type ChangePublisher,
  type Era,
  type ServerContext,
} from "./context.js";
import { SERVER_VERSION } from "../version.js";

/** What the factory is asked to build. */
export type ServerOptions = {
  /** The protocol era the instance serves (default `legacy`). */
  era?: Era;
  /**
   * Where change notifications go. Defaults to the instance itself, which is
   * right for stdio and for 2025-era sessions; the 2026-07-28 HTTP path
   * passes its handler's subscription bus.
   */
  publish?: ChangePublisher;
};

// Server Factory response
export type ServerFactoryResponse = {
  server: McpServer;
  /** End the instance's timers and other per-connection work. */
  cleanup: () => void;
};

/**
 * The state a multi-round tool carries between its rounds, sealed by the
 * codec below. `requestState` round-trips through the client, so it is signed
 * (HMAC-SHA256) and expires; the SDK checks it before the handler runs.
 */
export type RoundState = Record<string, unknown> & { step: string };

/**
 * The process-wide `requestState` codec. The key is per process: on the
 * 2026-07-28 HTTP path a later round may be served by a fresh instance, so
 * the key cannot belong to one. A deployment of several processes would load
 * a shared secret here instead.
 */
export const roundStateCodec = createRequestStateCodec<RoundState>({
  key: crypto.getRandomValues(new Uint8Array(32)),
  ttlSeconds: 600,
});

/**
 * Cache hints for the 2026-07-28 cacheable results (`ttlMs` / `cacheScope`).
 * The lists are the same for every client and change only with a
 * `list_changed` notification, so a shared cache may hold them for a minute;
 * `server/discover` changes only when the server is upgraded. 2025-era
 * responses never carry these fields. A static document resource sets a
 * longer hint of its own (resources/files.ts).
 */
export const CACHE_HINTS: Record<string, CacheHint> = {
  "server/discover": { ttlMs: 5 * 60_000, cacheScope: "public" },
  "tools/list": { ttlMs: 60_000, cacheScope: "public" },
  "prompts/list": { ttlMs: 60_000, cacheScope: "public" },
  "resources/list": { ttlMs: 60_000, cacheScope: "public" },
  "resources/templates/list": { ttlMs: 60_000, cacheScope: "public" },
};

/**
 * Server Factory
 *
 * Initializes a `McpServer` with its capabilities and instructions, and
 * registers the tools, resources and prompts for the era it serves.
 *
 * @param {ServerOptions} options - The era to serve and where its change
 * notifications go.
 * @returns {ServerFactoryResponse} The server instance, and a `cleanup`
 * function that ends its per-connection work when the connection closes.
 */
export const createServer = (
  options: ServerOptions = {},
): ServerFactoryResponse => {
  const era = options.era ?? "legacy";

  // Read the server instructions
  const instructions = readInstructions();

  const cleanups: Array<() => void> = [];
  let initializeTimeout: NodeJS.Timeout | null = null;

  // Create the server
  const server = new McpServer(
    {
      name: "mcp-servers/everything",
      title: "Everything Reference Server",
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        // `tools: { listChanged: true }` is advertised by the first
        // registerTool. Declaring it here would install McpServer's
        // tools/call handler in the constructor, before guardTaskTools can
        // wrap it.
        prompts: {
          listChanged: true,
        },
        resources: {
          subscribe: true,
          listChanged: true,
        },
        // Deprecated as of 2026-07-28 (SEP-2577), and still served on both
        // eras: 2025-era clients set the level with `logging/setLevel`,
        // 2026-07-28 clients per request in `_meta`.
        logging: {},
        // The tasks extension (`io.modelcontextprotocol/tasks`) is
        // advertised on 2026-07-28 only, where it is served.
        ...(era === "modern" && { extensions: { [TASKS_EXTENSION]: {} } }),
      },
      instructions,
      cacheHints: CACHE_HINTS,
      requestState: { verify: roundStateCodec.verify },
    },
  );

  // Resources a 2025-era client has subscribed to on this instance. On
  // 2026-07-28 the client names them in its subscriptions/listen filter and
  // the serving entry delivers only what it asked for.
  const subscribed = new Set<string>();

  const context: ServerContext = {
    era,
    subscribed,
    publish:
      options.publish ??
      instancePublisher(server, (uri) =>
        era === "modern" ? true : subscribed.has(uri),
      ),
    onCleanup: (fn) => cleanups.push(fn),
  };

  // A task tool refuses, with -32021, a client that has not declared what it
  // needs; this wraps the tools/call handler the first registration installs.
  if (era === "modern") guardTaskTools(server);

  // Register the tools, resources and prompts every era gets
  registerTools(server, context);
  registerResources(server, context);
  registerPrompts(server);

  if (era === "modern") {
    // Each request carries the client's capabilities, so the tools that need
    // one are registered up front, along with the tasks extension.
    registerModernTools(server, context);
    registerTasksExtension(server);
  } else {
    registerLegacyTools(server, context);
    setSubscriptionHandlers(server, context.subscribed);

    // Perform post-initialization operations
    server.server.oninitialized = async () => {
      // Register conditional tools now that client capabilities are known.
      // This finishes before the `notifications/initialized` handler finishes.
      registerConditionalTools(server, context);

      // Sync roots if the client supports them.
      // This is delayed until after the `notifications/initialized` handler finishes,
      // otherwise, the request gets lost.
      initializeTimeout = setTimeout(() => syncRoots(server), 350);
    };
  }

  // Return the ServerFactoryResponse
  return {
    server,
    cleanup: () => {
      // Stop any simulated logging or resource updates that may have been initiated.
      for (const fn of cleanups.splice(0)) fn();
      subscribed.clear();
      if (initializeTimeout) clearTimeout(initializeTimeout);
    },
  } satisfies ServerFactoryResponse;
};
