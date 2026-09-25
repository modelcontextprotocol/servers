import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Tool configuration
const name = "get-env";
const GetEnvSchema = {
  key: z
    .string()
    .min(1)
    .describe("Name of the single environment variable to read."),
};
const config = {
  title: "Print Environment Tool",
  description:
    "Returns a single environment variable by name, helpful for debugging MCP server configuration without dumping the full process environment.",
  inputSchema: GetEnvSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Registers the 'get-env' tool.
 *
 * The registered tool retrieves and returns a single environment variable
 * from the current process as a JSON-formatted string encapsulated in a text response.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @returns {void}
 */
export const registerGetEnvTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const key = args.key;
    const value = process.env[key];

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              key,
              value: value ?? null,
              found: value !== undefined,
            },
            null,
            2
          ),
        },
      ],
    };
  });
};
