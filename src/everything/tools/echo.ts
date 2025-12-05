import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export const EchoSchema = z.object({
  message: z.string().describe("Message to echo"),
});

const name = "echo";
const config = {
  title: "Echo Tool",
  description: "Echoes back the input string",
  inputSchema: EchoSchema,
};

export const addToolEcho = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const validatedArgs = EchoSchema.parse(args);
    return {
      content: [{ type: "text", text: `Echo: ${validatedArgs.message}` }],
    };
  });
};
