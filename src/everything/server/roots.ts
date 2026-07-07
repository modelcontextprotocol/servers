import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  Root,
  RootsListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Track roots by session id
export const roots: Map<string | undefined, Root[]> = new Map<
  string | undefined,
  Root[]
>();

/**
 * Get the latest client roots list for the session.
 *
 * - Request and cache the roots list for the session if it has not been fetched before.
 * - Return the cached roots list for the session if it exists.
 *
 * When requesting the roots list for a session, it also sets up a `roots/list_changed`
 * notification handler. This ensures that updates are automatically fetched and handled
 * in real-time.
 *
 * This function is idempotent. It requests roots from the client at most once per session,
 * even if the initial request fails or the client returns no roots; callers get the
 * cached result (possibly an empty list) on subsequent calls. Later `roots/list_changed`
 * notifications are the only way the cache is refreshed.
 *
 * @param {McpServer} server - An instance of the MCP server used to communicate with the client.
 * @param {string} [sessionId] - An optional session id used to associate the roots list with a specific client session.
 */
export const syncRoots = async (server: McpServer, sessionId?: string) => {
  const clientCapabilities = server.server.getClientCapabilities() || {};
  const clientSupportsRoots: boolean = clientCapabilities?.roots !== undefined;

  if (!clientSupportsRoots) {
    return;
  }

  // Function to request the updated roots list from the client
  const requestRoots = async () => {
    try {
      const response = await server.server.listRoots();
      if (response && "roots" in response) {
        roots.set(sessionId, response.roots);
        await server.sendLoggingMessage(
          {
            level: "info",
            logger: "everything-server",
            data: `Roots updated: ${response?.roots?.length} root(s) received from client`,
          },
          sessionId
        );
      } else {
        // Client returned no usable roots. Cache an empty list so the session
        // is marked as synced and we don't re-fetch on every tool call.
        roots.set(sessionId, []);
        await server.sendLoggingMessage(
          {
            level: "info",
            logger: "everything-server",
            data: "Client returned no roots set",
          },
          sessionId
        );
      }
    } catch (error) {
      // Keep the session marked as synced even on failure. Otherwise every
      // subsequent tool call would re-invoke listRoots and re-register the
      // list_changed notification handler.
      if (!roots.has(sessionId)) {
        roots.set(sessionId, []);
      }
      console.error(
        `Failed to request roots from client ${sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  // If the roots have not been synced for this client,
  // set notification handler and request initial roots.
  if (!roots.has(sessionId)) {
    // Mark the session as in-flight before awaiting the request so that a
    // re-entrant call (e.g. a tool invoked while the initial fetch is still
    // pending) sees a cached entry and doesn't install a second handler.
    roots.set(sessionId, []);

    server.server.setNotificationHandler(
      RootsListChangedNotificationSchema,
      requestRoots
    );

    await requestRoots();
  }

  return roots.get(sessionId);
};
