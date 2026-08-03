import { McpServer } from "@modelcontextprotocol/server";
import { getNotifier } from "../server/notifier.js";

// Track subscriber session id lists by URI
const subscriptions: Map<string, Set<string | undefined>> = new Map<
  string,
  Set<string | undefined>
>();

// Interval to send notifications to subscribers
const subsUpdateIntervals: Map<string | undefined, NodeJS.Timeout | undefined> =
  new Map<string | undefined, NodeJS.Timeout | undefined>();

/**
 * Sets up the subscription and unsubscription handlers for the provided server.
 *
 * The function defines two request handlers:
 * 1. A `Subscribe` handler that allows clients to subscribe to specific resource URIs.
 * 2. An `Unsubscribe` handler that allows clients to unsubscribe from specific resource URIs.
 *
 * The `Subscribe` handler performs the following actions:
 * - Extracts the URI and session ID from the request.
 * - Logs a message acknowledging the subscription request.
 * - Updates the internal tracking of subscribers for the given URI.
 *
 * The `Unsubscribe` handler performs the following actions:
 * - Extracts the URI and session ID from the request.
 * - Logs a message acknowledging the unsubscription request.
 * - Removes the subscriber for the specified URI.
 *
 * @param {McpServer} server - The server instance to which subscription handlers will be attached.
 */
export const setSubscriptionHandlers = (server: McpServer) => {
  // Set the subscription handler
  server.server.setRequestHandler(
    "resources/subscribe",
    async (request, ctx) => {
      // Get the URI to subscribe to
      const { uri } = request.params;

      // No session id on stdio. `undefined` is a legitimate subscriber key
      // here -- it identifies the single sessionless connection -- so it is
      // carried as-is rather than cast away.
      const sessionId: string | undefined = ctx.sessionId;

      // Acknowledge the subscribe request
      await server.sendLoggingMessage(
        {
          level: "info",
          data: `Received Subscribe Resource request for URI: ${uri} ${
            sessionId ? `from session ${sessionId}` : ""
          }`,
        },
        sessionId
      );

      // Get the subscribers for this URI
      const subscribers =
        subscriptions.get(uri) ?? new Set<string | undefined>();
      subscribers.add(sessionId);
      subscriptions.set(uri, subscribers);
      return {};
    }
  );

  // Set the unsubscription handler
  server.server.setRequestHandler(
    "resources/unsubscribe",
    async (request, ctx) => {
      // Get the URI to subscribe to
      const { uri } = request.params;

      // No session id on stdio. `undefined` is a legitimate subscriber key
      // here -- it identifies the single sessionless connection -- so it is
      // carried as-is rather than cast away.
      const sessionId: string | undefined = ctx.sessionId;

      // Acknowledge the subscribe request
      await server.sendLoggingMessage(
        {
          level: "info",
          data: `Received Unsubscribe Resource request: ${uri} ${
            sessionId ? `from session ${sessionId}` : ""
          }`,
        },
        sessionId
      );

      // Remove the subscriber
      subscriptions.get(uri)?.delete(sessionId);
      return {};
    }
  );
};

/**
 * Sends simulated resource update notifications to the subscribed client.
 *
 * Publishing goes through `getNotifier`, not the server instance directly, so
 * the update reaches the client on both eras. On stdio the notifier calls the
 * pinned instance and `serveStdio` routes it; over Streamable HTTP it publishes
 * onto the handler's `subscriptions/listen` bus, which is the only path that
 * works when every request is served by a fresh instance.
 *
 * The legacy-era `resources/subscribe` bookkeeping below is only consulted when a
 * session exists. On a 2026-07-28 connection the client's `subscriptions/listen`
 * filter decides who receives a `resources/updated`, so the notifier is called
 * for every known URI and the bus does the filtering.
 *
 * Synchronous: publishing through the notifier is fire-and-forget on both
 * paths, so there is nothing to await.
 *
 * @param {McpServer} server - The server instance used to send notifications.
 * @param {string | undefined} sessionId - The session ID of the client to check for subscriptions.
 */
const sendSimulatedResourceUpdates = (
  server: McpServer,
  sessionId: string | undefined
): void => {
  const notifier = getNotifier(server);

  // Search all URIs for ones this client is subscribed to
  for (const [uri, subscribers] of subscriptions) {
    // If this client is subscribed, send the notification. Subscribers are
    // reaped by `cleanupSession` -> `stopSimulatedResourceUpdates` when the
    // session ends, not here: a session that is absent from this URI's set is
    // simply not subscribed to it, which says nothing about whether it is
    // still connected.
    if (subscribers.has(sessionId)) {
      notifier.resourceUpdated(uri);
    }
  }
};

/**
 * Starts the process of simulating resource updates and sending server notifications
 * to the client for the resources they are subscribed to. If the update interval is
 * already active, invoking this function will not start another interval.
 *
 * @param server
 * @param sessionId
 */
export const beginSimulatedResourceUpdates = (
  server: McpServer,
  sessionId: string | undefined
) => {
  if (!subsUpdateIntervals.has(sessionId)) {
    // Send once immediately
    sendSimulatedResourceUpdates(server, sessionId);

    // Set the interval to send later resource update notifications to this client
    subsUpdateIntervals.set(
      sessionId,
      setInterval(() => sendSimulatedResourceUpdates(server, sessionId), 5000)
    );
  }
};

/**
 * Stops simulated resource updates for a given session.
 *
 * This function halts any active intervals associated with the provided session ID
 * and removes the session's corresponding entries from resource management collections.
 * Session ID can be undefined for stdio.
 *
 * @param {string} [sessionId]
 */
export const stopSimulatedResourceUpdates = (sessionId?: string) => {
  // Remove active intervals
  if (subsUpdateIntervals.has(sessionId)) {
    const subsUpdateInterval = subsUpdateIntervals.get(sessionId);
    clearInterval(subsUpdateInterval);
    subsUpdateIntervals.delete(sessionId);
  }
};
