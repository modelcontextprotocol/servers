import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool configuration
const name = "get-env";
const config = {
  title: "Get Environment Variable",
  description:
    "Returns a specific environment variable value by name. Use this to check individual configuration values.",
  inputSchema: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "Name of the environment variable to retrieve",
      },
    },
    required: ["key"],
  },
};

/**
 * Registers the 'get-env' tool.
 *
 * The registered tool retrieves and returns a specific environment variable
 * by name. This prevents accidental exposure of sensitive environment variables
 * that may be present in the full process.env object.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @returns {void}
 */
export const registerGetEnvTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const key = args.key as string;
    const value = process.env[key];

    if (value === undefined) {
      return {
        content: [
          {
            type: "text",
            text: `Environment variable '${key}' is not set.`,
          },
        ],
        isError: true,
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
