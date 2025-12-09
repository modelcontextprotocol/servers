import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool configuration
const name = "print-env";
const config = {
  title: "Print Environment Tool",
  description:
    "Prints all environment variables, helpful for debugging MCP server configuration",
  inputSchema: {},
};

/**
 * Registers the Echo Tool with the given MCP server. This tool, when invoked,
 * retrieves and returns the environment variables of the current process
 * as a JSON-formatted string encapsulated in a text response.
 *
 * @param {McpServer} server - The MCP server instance where the Echo Tool is to be registered.
 * @returns {void}
 */
export const registerPrintEnvTool = (server: McpServer) => {
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
