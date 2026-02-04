import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool input schema
const GetSumSchema = z.object({
  a: z.number().describe("First number"),
  b: z.number().describe("Second number"),
});

// Tool configuration
const name = "get-sum";
const config = {
  title: "Get Sum Tool",
  description: "Returns the sum of two numbers",
  inputSchema: GetSumSchema,
};

/**
 * Registers the 'get-sum' tool.
 **
 * The registered tool processes input arguments, validates them using a predefined schema,
 * calculates the sum of two numeric values, and returns the result in a content block.
 *
 * Expects input arguments to conform to a specific schema that includes two numeric properties, `a` and `b`.
 * Validation is performed to ensure the input adheres to the expected structure before calculating the sum.
 *
 * The result is returned as a Promise resolving to an object containing the computed sum in a text format.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetSumTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const validatedArgs = GetSumSchema.parse(args);
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
