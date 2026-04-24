import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Tool input schema
export const GetEnvSchema = z.object({
  key: z.string().describe(
    "The name of the environment variable to retrieve (e.g., 'PATH', 'HOME', 'USER')",
  ),
});

// Tool configuration
const name = "get-env";
const config = {
  title: "Print Environment Tool",
  description:
    "Returns the value of a specific environment variable, helpful for debugging MCP server configuration",
  inputSchema: GetEnvSchema,
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
    const { key } = GetEnvSchema.parse(args);
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
