import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Track subscriber session id lists by URI
const subscriptions: Map<string, Set<string | undefined>> = new Map<
  string,
  Set<string | undefined>
>();

// Track transport by session id
const transports: Map<string | undefined, Transport> = new Map<
  string | undefined,
  Transport
>();

// Interval to send notifications to subscribers
let subsUpdateIntervals: Map<string | undefined, NodeJS.Timeout | undefined> =
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
    SubscribeRequestSchema,
    async (request, extra) => {
      // Get the URI to subscribe to
      const { uri } = request.params;

      // Get the session id (can be undefined for stdio)
      const sessionId = extra.sessionId as string;

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
      const subscribers = subscriptions.has(uri)
        ? (subscriptions.get(uri) as Set<string>)
        : new Set<string>();
      subscribers.add(sessionId);
      subscriptions.set(uri, subscribers);
      return {};
    }
  );

  // Set the unsubscription handler
  server.server.setRequestHandler(
    UnsubscribeRequestSchema,
    async (request, extra) => {
      // Get the URI to subscribe to
      const { uri } = request.params;

      // Get the session id (can be undefined for stdio)
      const sessionId = extra.sessionId as string;

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
      if (subscriptions.has(uri)) {
        const subscribers = subscriptions.get(uri) as Set<string>;
        if (subscribers.has(sessionId)) subscribers.delete(sessionId);
      }
      return {};
    }
  );
};

/**
 * Starts the process of simulating resource updates and sending server notifications
 * to subscribed clients at regular intervals. If the update interval is already active,
 * invoking this function will not start another interval.
 *
 * Note that tracking and sending updates on the transport of the subscriber allows for
 * multiple clients to be connected and independently receive only updates about their
 * own subscriptions. Had we used `server.notification` instead, all clients would
 * receive updates for all subscriptions.
 *
 * @param {Transport} transport - The transport to the subscriber
 */
export const beginSimulatedResourceUpdates = (transport: Transport) => {
  const sessionId = transport?.sessionId;
  if (!transports.has(sessionId)) {
    // Store the transport
    transports.set(sessionId, transport);

    // Set the interval to send notifications to the subscribers
    subsUpdateIntervals.set(
      sessionId,
      setInterval(async () => {
        // Send notifications to all subscribers for each URI
        for (const uri of subscriptions.keys()) {
          const subscribers = subscriptions.get(uri) as Set<string | undefined>;

          // Get the transport for the subscriber and send the notification
          if (subscribers.has(sessionId)) {
            const transport = transports.get(sessionId) as Transport;
            await transport.send({
              jsonrpc: "2.0",
              method: "notifications/resources/updated",
              params: { uri },
            });
          } else {
            subscribers.delete(sessionId); // subscriber has disconnected
          }
        }
      }, 10000)
    );
  }
};

/**
 * Stops simulated resource updates for a given session.
 *
 * This function halts any active intervals associated with the provided session ID
 * and removes the session's corresponding entries from resource management collections.
 *
 * @param {string} [sessionId] - The unique identifier of the session for which simulated resource updates should be stopped. If not provided, no action is performed.
 */
export const stopSimulatedResourceUpdates = (sessionId?: string) => {
  // Remove active intervals
  if (subsUpdateIntervals.has(sessionId)) {
    const subsUpdateInterval = subsUpdateIntervals.get(sessionId);
    clearInterval(subsUpdateInterval);
    subsUpdateIntervals.delete(sessionId);
  }
  // Remove transport for the session
  if (transports.has(sessionId)) {
    transports.delete(sessionId);
  }
};
