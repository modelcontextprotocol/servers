import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  Root,
  RootsListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Track roots by session id
const roots: Map<string | undefined, Root[]> = new Map<
  string | undefined,
  Root[]
>();

/**
 * Sets a handler for the "RootsListChanged" notification from the client.
 *
 * This handler updates the local roots list when notified and logs relevant
 * acknowledgement or error.
 *
 * @param {McpServer} mcpServer - The instance of the McpServer managing server communication.
 * @param {string | undefined} sessionId - An optional session ID used for logging purposes.
 */
export const setRootsListChangedHandler = (
  mcpServer: McpServer,
  sessionId?: string
) => {
  const server = mcpServer.server;

  // Set the notification handler
  server.setNotificationHandler(
    RootsListChangedNotificationSchema,
    async () => {
      try {
        // Request the updated roots list from the client
        const response = await server.listRoots();
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
    }
  );
};
