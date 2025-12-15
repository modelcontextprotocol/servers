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
 * Sync the root directories from the client by requesting and updating the roots list for
 * the specified session.
 *
 * Also sets up a notification handler to listen for changes in the roots list, ensuring that
 * updates are automatically fetched and handled in real-time.
 *
 * @param {McpServer} server - An instance of the MCP server used to communicate with the client.
 * @param {string} [sessionId] - An optional session id used to associate the roots list with a specific client session.
 *
 * @throws {Error} In case of a failure to request the roots from the client, an error log message is sent.
 */
export const syncRoots = async (server: McpServer, sessionId?: string) => {

  const clientCapabilities = server.server.getClientCapabilities() || {};
  const clientSupportsRoots: boolean = clientCapabilities.roots !== undefined;

  // If roots have not been fetched for this client, fetch them
  if (clientSupportsRoots && !roots.has(sessionId)) {
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
              data: `Roots updated: ${response.roots.length} root(s) received from client`,
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
        await server.sendLoggingMessage(
          {
            level: "error",
            logger: "everything-server",
            data: `Failed to request roots from client: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
          sessionId
        );
      }
    };

    // Set the list changed notification handler
    server.server.setNotificationHandler(
      RootsListChangedNotificationSchema,
      requestRoots
    );

    // Request initial roots list immediatelys
    await requestRoots();

    // Return the roots list for this client
    return roots.get(sessionId);
  }
};
