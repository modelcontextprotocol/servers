import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const AddSchema = z.object({
  a: z.number().describe("First number"),
  b: z.number().describe("Second number"),
});

const name = "add";
const config = {
  title: "Add Tool",
  description: "Adds two numbers",
  inputSchema: AddSchema,
};

export const registerAddTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const validatedArgs = AddSchema.parse(args);
    const sum = validatedArgs.a + validatedArgs.b;
    return {
      content: [
        {
          type: "text",
          text: `The sum of ${validatedArgs.a} and ${validatedArgs.b} is ${sum}.`,
        },
      ],
    };
  });
};
