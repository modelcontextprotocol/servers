// 2025-era per-resource subscriptions, and the simulated updates
// `toggle-subscriber-updates` sends for them.
//
// `resources/subscribe` and `resources/unsubscribe` exist only on the 2025
// protocol era. A 2026-07-28 client names the resources it wants updates for
// in its `subscriptions/listen` filter instead, and the serving entry
// delivers each `notifications/resources/updated` only to a stream that asked
// for it (`trigger-resource-update` shows that). The subscribed set belongs to
// the server instance serving the client's connection or session, so no
// session map is needed (#4852).

import { McpServer } from "@modelcontextprotocol/server";

/**
 * Install the `resources/subscribe` and `resources/unsubscribe` handlers on a
 * 2025-era server, recording each subscription in `subscribed`.
 *
 * Each handler acknowledges the request with an info-level log message, then
 * adds the URI to, or removes it from, the set.
 *
 * @param {McpServer} server - The server instance to which subscription handlers will be attached.
 * @param {Set<string>} subscribed - The URIs this server's client has subscribed to.
 */
export const setSubscriptionHandlers = (
  server: McpServer,
  subscribed: Set<string>,
) => {
  server.server.setRequestHandler("resources/subscribe", async (request) => {
    const { uri } = request.params;
    await server.sendLoggingMessage(
      {
        level: "info",
        data: `Received Subscribe Resource request for URI: ${uri}`,
      },
      server.server.transport?.sessionId,
    );
    subscribed.add(uri);
    return {};
  });

  server.server.setRequestHandler("resources/unsubscribe", async (request) => {
    const { uri } = request.params;
    await server.sendLoggingMessage(
      {
        level: "info",
        data: `Received Unsubscribe Resource request: ${uri}`,
      },
      server.server.transport?.sessionId,
    );
    subscribed.delete(uri);
    return {};
  });
};

/**
 * Start sending `server`'s client a `notifications/resources/updated` for each
 * resource it has subscribed to, now and then every five seconds.
 *
 * @param {McpServer} server - The server whose client receives the updates.
 * @param {Set<string>} subscribed - The URIs that client has subscribed to.
 * @returns {() => void} Stops the updates.
 */
export const beginSimulatedResourceUpdates = (
  server: McpServer,
  subscribed: Set<string>,
): (() => void) => {
  // Fire-and-forget: this runs on a timer with no caller to await it. A send
  // that fails (e.g. the transport closed before the updates were stopped) is
  // logged rather than left to become an unhandled rejection.
  const send = async () => {
    try {
      for (const uri of [...subscribed]) {
        await server.server.sendResourceUpdated({ uri });
      }
    } catch (error: unknown) {
      console.error("Simulated resource update failed:", error);
    }
  };
  void send();
  const interval = setInterval(() => void send(), 5000);
  return () => clearInterval(interval);
};
