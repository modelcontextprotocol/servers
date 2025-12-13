import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Tool input schema
export const EchoSchema = z.object({
  message: z.string().describe("Message to echo"),
});

// Tool configuration
const name = "echo";
const config = {
  title: "Echo Tool",
  description: "Echoes back the input string",
  inputSchema: EchoSchema,
};

/**
 * Registers the 'echo' tool.
 *
 * The registered tool validates input arguments using the EchoSchema and
 * returns a response that echoes the message provided in the arguments.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @returns {void}
 */
export const registerEchoTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const validatedArgs = EchoSchema.parse(args);
    return {
      content: [{ type: "text", text: `Echo: ${validatedArgs.message}` }],
    };
  });
};
