import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool configuration
const name = "get-env";
const config = {
  title: "Print Environment Tool",
  description:
    "Returns all environment variables, helpful for debugging MCP server configuration",
  inputSchema: {},
};

/**
 * Registers the 'get-env' tool.
 *
 * The registered tool Retrieves and returns the environment variables
 * of the current process as a JSON-formatted string encapsulated in a text response.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @returns {void}
 */
export const registerGetEnvTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(process.env, null, 2),
        },
      ],
    };
  });
};
