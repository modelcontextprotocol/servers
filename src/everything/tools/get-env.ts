import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool configuration
const name = "get-env";
const config = {
  title: "Print Environment Tool",
  description:
    "Returns the value of a specific environment variable, helpful for debugging MCP server configuration",
  inputSchema: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description:
          "The name of the environment variable to retrieve (e.g., 'PATH', 'HOME', 'USER')",
      },
    },
    required: ["key"],
  },
};

/**
 * Registers the 'get-env' tool.
 *
 * The registered tool retrieves and returns the value of a specific
 * environment variable from the current process.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @returns {void}
 */
export const registerGetEnvTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const { key } = args as { key: string };
    const value = process.env[key];

    if (value === undefined) {
      return {
        content: [
          {
            type: "text",
            text: `Environment variable '${key}' is not set.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `${key}=${value}`,
        },
      ],
    };
  });
};
