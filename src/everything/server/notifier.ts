import type { McpServer, ServerNotifier } from "@modelcontextprotocol/server";

/**
 * Change-notification routing for a dual-era server.
 *
 * The two serving entries publish change notifications differently:
 *
 * - `serveStdio` pins one instance per connection and routes that instance's
 *   `send*ListChanged()` / `sendResourceUpdated()` calls onto whatever
 *   `subscriptions/listen` streams are open (2026-07-28), or emits them
 *   unsolicited (legacy-era). Instance methods are the right call there.
 * - `createMcpHandler` builds a fresh instance per request, so an instance has
 *   no long-lived stream to write to. Publishing goes through the handler's
 *   `notify` facade, which fans out over the handler's event bus to every open
 *   subscription.
 *
 * Tools should not care which entry is running. They call `getNotifier(server)`
 * and get something that does the right thing for the active transport.
 */

let busNotifier: ServerNotifier | undefined;

/**
 * Point change notifications at an HTTP handler's `subscriptions/listen` bus.
 * Called once by the Streamable HTTP entry with `handler.notify`; passing
 * `undefined` reverts to instance-backed publishing.
 */
export const setBusNotifier = (notifier: ServerNotifier | undefined): void => {
  busNotifier = notifier;
};

/**
 * Get the notifier a tool should publish through.
 *
 * Returns the handler bus when one has been registered (Streamable HTTP),
 * otherwise a facade over the supplied instance (stdio).
 */
export const getNotifier = (server: McpServer): ServerNotifier => {
  if (busNotifier) return busNotifier;

  // stdio: the pinned instance is the publish path. These are fire-and-forget
  // from the caller's perspective; a send that fails on a closing connection
  // must not take the tool call down with it.
  const swallow = (error: unknown) => {
    console.error("Failed to publish change notification:", error);
  };

  // Go through the low-level `Server`: its senders return promises, so a send
  // that rejects on a closing connection can be caught. The `McpServer`
  // wrappers of the same names return `void` and would leave it unhandled.
  return {
    toolsChanged: () => void server.server.sendToolListChanged().catch(swallow),
    promptsChanged: () =>
      void server.server.sendPromptListChanged().catch(swallow),
    resourcesChanged: () =>
      void server.server.sendResourceListChanged().catch(swallow),
    resourceUpdated: (uri: string) =>
      void server.server.sendResourceUpdated({ uri }).catch(swallow),
  };
};
