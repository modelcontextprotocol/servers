import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool configuration
const name = "get-roots-list";
const config = {
  title: "Get Roots List Tool",
  description:
    "Lists the current MCP roots provided by the client. Demonstrates the roots protocol capability even though this server doesn't access files.",
  inputSchema: {},
};

/**
 * Registers the 'get-roots-list' tool with the given MCP server.
 *
 * If the client does not support the roots protocol, the tool is not registered.
 *
 * The registered tool interacts with the MCP roots protocol, which enables the server to access information about
 * the client's workspace directories or file system roots. When supported by the client, the server retrieves
 * and formats the current list of roots for display.
 *
 * Key behaviors:
 * - Determines whether the connected MCP client supports the roots protocol by checking client capabilities.
 * - Fetches and formats the list of roots, including their names and URIs, if supported by the client.
 * - Handles cases where roots are not supported, or no roots are currently provided, with explanatory messages.
 *
 * @param {McpServer} server - The server instance interacting with the MCP client and managing the roots protocol.
 */
export const registerGetRootsListTool = (server: McpServer) => {
  const clientSupportsRoots =
    server.server.getClientCapabilities()?.roots?.listChanged;
  if (!clientSupportsRoots) {
    server.registerTool(
      name,
      config,
      async (args, extra): Promise<CallToolResult> => {
        const currentRoots = (await server.server.listRoots()).roots;
        if (currentRoots.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  "The client supports roots but no roots are currently configured.\n\n" +
                  "This could mean:\n" +
                  "1. The client hasn't provided any roots yet\n" +
                  "2. The client provided an empty roots list\n" +
                  "3. The roots configuration is still being loaded",
              },
            ],
          };
        }

        const rootsList = currentRoots
          .map((root, index) => {
            return `${index + 1}. ${root.name || "Unnamed Root"}\n   URI: ${
              root.uri
            }`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text:
                `Current MCP Roots (${currentRoots.length} total):\n\n${rootsList}\n\n` +
                "Note: This server demonstrates the roots protocol capability but doesn't actually access files. " +
                "The roots are provided by the MCP client and can be used by servers that need file system access.",
            },
          ],
        };
      }
    );
  }
};
