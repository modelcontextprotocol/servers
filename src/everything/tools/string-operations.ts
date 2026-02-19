import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool input schema
const StringOperationsSchema = z.object({
  operation: z.enum(["upper", "lower", "reverse", "length", "capitalize", "title"]).describe("String operation to perform"),
  text: z.string().describe("Text to operate on"),
  count: z.number().optional().describe("Optional count for operations that need it"),
});

// Tool configuration
const name = "string-operations";
const config = {
  title: "String Operations Tool",
  description: "Perform various string operations like case conversion, reversal, and counting",
  inputSchema: StringOperationsSchema,
};

/**
 * Registers the 'string-operations' tool.
 *
 * The registered tool provides various string manipulation operations including:
 * - upper: Convert to uppercase
 * - lower: Convert to lowercase
 * - reverse: Reverse the string
 * - length: Get string length
 * - capitalize: Capitalize first letter
 * - title: Convert to title case
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerStringOperationsTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const validatedArgs = StringOperationsSchema.parse(args);
    let result: string | number;

    switch (validatedArgs.operation) {
      case "upper":
        result = validatedArgs.text.toUpperCase();
        break;
      case "lower":
        result = validatedArgs.text.toLowerCase();
        break;
      case "reverse":
        result = validatedArgs.text.split('').reverse().join('');
        break;
      case "length":
        result = validatedArgs.text.length;
        break;
      case "capitalize":
        result = validatedArgs.text.charAt(0).toUpperCase() + validatedArgs.text.slice(1).toLowerCase();
        break;
      case "title":
        result = validatedArgs.text.replace(/\w\S*/g, (txt) => 
          txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
        break;
      default:
        throw new Error(`Unknown operation: ${validatedArgs.operation}`);
    }

    return {
      content: [
        {
          type: "text",
          text: `Operation '${validatedArgs.operation}' on "${validatedArgs.text}" result: ${result}`,
        },
      ],
    };
  });
};
