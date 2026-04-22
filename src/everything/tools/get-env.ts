import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Tool input schema
const GetEnvSchema = z.object({
  key: z.string().describe("Specific environment variable name"),
});

// Tool configuration
const name = "get-env";
const config = {
  title: "Get Environment Variable",
  description:
    'Returns the value of a specific environment variable. Pass the variable name via the "key" argument.',
  inputSchema: GetEnvSchema,
};

/**
 * Registers the 'get-env' tool.
 *
 * The registered tool retrieves and returns the value of a specific
 * environment variable specified by the 'key' argument.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @returns {void}
 */
export const registerGetEnvTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const { key } = GetEnvSchema.parse(args);
    const value = process.env[key];

    // Return a clear message if the key doesn't exist rather than exposing the full env
    if (value === undefined) {
      return {
        content: [{ type: "text", text: `Environment variable "${key}" is not set.` }],
      };
    }

    return {
      content: [{ type: "text", text: value }],
    };
  });
};
