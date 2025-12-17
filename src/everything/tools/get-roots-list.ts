import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { syncRoots } from "../server/roots.js";

// Tool configuration
const name = "get-roots-list";
const config = {
  title: "Get Roots List Tool",
  description:
    "Lists the current MCP roots provided by the client. Demonstrates the roots protocol capability even though this server doesn't access files.",
  inputSchema: {},
};

/**
 * Registers the 'get-roots-list' tool.
 *
 * If the client does not support the roots capability, the tool is not registered.
 *
 * The registered tool interacts with the MCP roots capability, which enables the server to access
 * information about the client's workspace directories or file system roots.
 *
 * When supported, the server automatically retrieves and formats the current list of roots from the
 * client upon connection and whenever the client sends a `roots/list_changed` notification.
 *
 * Therefore, this tool displays the roots that the server currently knows about for the connected
 * client. If for some reason the server never got the initial roots list, the tool will request the
 * list from the client again.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetRootsListTool = (server: McpServer) => {
  // Does client support roots?
  const clientCapabilities = server.server.getClientCapabilities() || {};
  const clientSupportsRoots: boolean = clientCapabilities.roots !== undefined;

  // If so, register tool
  if (clientSupportsRoots) {
    server.registerTool(
      name,
      config,
      async (args, extra): Promise<CallToolResult> => {
        // Get the current rootsFetch the current roots list from the client if need be
        const currentRoots = await syncRoots(server, extra.sessionId);

        // Respond if client supports roots but doesn't have any configured
        if (
          clientSupportsRoots &&
          (!currentRoots || currentRoots.length === 0)
        ) {
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

        // Create formatted response if there is a list of roots
        const rootsList = currentRoots
          ? currentRoots
              .map((root, index) => {
                return `${index + 1}. ${root.name || "Unnamed Root"}\n   URI: ${
                  root.uri
                }`;
              })
              .join("\n\n")
          : "No roots found";

        return {
          content: [
            {
              type: "text",
              text:
                `Current MCP Roots (${
                  currentRoots!.length
                } total):\n\n${rootsList}\n\n` +
                "Note: This server demonstrates the roots protocol capability but doesn't actually access files. " +
                "The roots are provided by the MCP client and can be used by servers that need file system access.",
            },
          ],
        };
      }
    );
  }
};
