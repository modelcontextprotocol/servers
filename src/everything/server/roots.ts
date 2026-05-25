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
 * Get the latest the client roots list for the session.
 *
 * - Request and cache the roots list for the session if it has not been fetched before.
 * - Return the cached roots list for the session if it exists.
 *
 * When requesting the roots list for a session, it also sets up a `roots/list_changed`
 * notification handler. This ensures that updates are automatically fetched and handled
 * in real-time.
 *
 * This function is idempotent. It should only request roots from the client once per session,
 * returning the cached version thereafter.
 *
 * @param {McpServer} server - An instance of the MCP server used to communicate with the client.
 * @param {string} [sessionId] - An optional session id used to associate the roots list with a specific client session.
 *
 * @throws {Error} In case of a failure to request the roots from the client, an error log message is sent.
 */
export const syncRoots = async (server: McpServer, sessionId?: string) => {
  const clientCapabilities = server.server.getClientCapabilities() || {};
  const clientSupportsRoots: boolean = clientCapabilities?.roots !== undefined;

  // Fetch the roots list for this client
  if (clientSupportsRoots) {
    // Function to request the updated roots list from the client
    const requestRoots = async () => {
      try {
        // Request the updated roots list from the client
        const response = await server.server.listRoots();
        if (response && "roots" in response) {
          // Store the roots list for this client
          roots.set(sessionId, response.roots);

          // Notify the client of roots received
          await server.sendLoggingMessage(
            {
              level: "info",
              logger: "everything-server",
              data: `Roots updated: ${response?.roots?.length} root(s) received from client`,
            },
            sessionId
          );
        } else {
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
        console.error(
          `Failed to request roots from client ${sessionId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    };

    // If the roots have not been synced for this client,
    // set notification handler and request initial roots
    if (!roots.has(sessionId)) {
      // Set the list changed notification handler
      server.server.setNotificationHandler(
        RootsListChangedNotificationSchema,
        requestRoots
      );

      // Request the initial roots list immediately
      await requestRoots();
    }

    // Return the roots list for this client
    return roots.get(sessionId);
  }
};
