import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool input schema
const AddSchema = z.object({
  a: z.number().describe("First number"),
  b: z.number().describe("Second number"),
});

// Tool configuration
const name = "add";
const config = {
  title: "Add Tool",
  description: "Adds two numbers",
  inputSchema: AddSchema,
};

/**
 * Registers the 'add' tool with the provided McpServer instance.
 **
 * The registered tool processes input arguments, validates them using a predefined schema,
 * performs addition on two numeric values, and returns the result in a structured format.
 *
 * Expects input arguments to conform to a specific schema that includes two numeric properties, `a` and `b`.
 * Validation is performed to ensure the input adheres to the expected structure before calculating the sum.
 *
 * The result is returned as a Promise resolving to an object containing the computed sum in a text format.
 *
 * @param {McpServer} server - The server instance where the addition tool will be registered.
 */
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
