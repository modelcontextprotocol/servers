// The per-instance context the server factory hands to the features that
// need more than the `McpServer` itself (#4852).
//
// Before the 2026-07-28 revision, features that kept state across calls
// (simulated logging, resource subscriptions, the roots cache, the URL
// elicitation error path) held it in module-level maps keyed by the
// transport's session id. The 2026-07-28 revision has no sessions, so that
// state now lives here, on the server instance the factory built: one per
// stdio connection, one per 2025-era Streamable HTTP session, and one per
// request on the 2026-07-28 HTTP path, where nothing survives between
// requests unless the server mints a handle for it (as the tasks store does).
//
// The context also carries the protocol era the instance serves, because a
// few features differ by era, and the publisher that announces list and
// resource changes, because where a change notification goes differs by
// transport: on stdio and on a 2025-era session the instance sends it
// itself, while on the 2026-07-28 HTTP path the instance lives for one
// request and the change goes out on the handler's subscription bus.

import type { McpServer } from "@modelcontextprotocol/server";

/** The protocol era a server instance serves. */
export type Era = "legacy" | "modern";

/** Announces list and resource changes to the clients that asked for them. */
export type ChangePublisher = {
  toolsChanged: () => void;
  promptsChanged: () => void;
  resourcesChanged: () => void;
  resourceUpdated: (uri: string) => void;
};

/** What the factory hands to a feature that needs more than the server. */
export type ServerContext = {
  /** The protocol era this instance serves. */
  era: Era;
  /** Where this instance's change notifications go. */
  publish: ChangePublisher;
  /**
   * The resources a 2025-era client has subscribed to with
   * `resources/subscribe`. Always empty on 2026-07-28, which has no such
   * method.
   */
  subscribed: Set<string>;
  /** Run `fn` when the instance is cleaned up (a connection or session ends). */
  onCleanup: (fn: () => void) => void;
};

/**
 * A publisher that sends each change from `server` itself. On a 2025-era
 * connection the notification goes to the client unsolicited; on a
 * 2026-07-28 stdio connection `serveStdio` routes it onto the open
 * `subscriptions/listen` streams that asked for it.
 *
 * `resourceUpdated` is sent only for a URI `isSubscribed` accepts: a 2025-era
 * client subscribes per resource, and on 2026-07-28 the listen router does
 * the filtering, so the server passes `() => true` there.
 */
export function instancePublisher(
  server: McpServer,
  isSubscribed: (uri: string) => boolean,
): ChangePublisher {
  const report = (error: unknown) =>
    console.error("Change notification failed:", error);
  // The low-level sends return their promise; McpServer's own helpers start
  // the same send and drop it, so a failed one would go unhandled.
  const send = (notify: () => Promise<void>) => {
    if (server.isConnected()) notify().catch(report);
  };
  return {
    toolsChanged: () => send(() => server.server.sendToolListChanged()),
    promptsChanged: () => send(() => server.server.sendPromptListChanged()),
    resourcesChanged: () => send(() => server.server.sendResourceListChanged()),
    resourceUpdated: (uri) => {
      if (isSubscribed(uri)) {
        server.server.sendResourceUpdated({ uri }).catch(report);
      }
    },
  };
}
