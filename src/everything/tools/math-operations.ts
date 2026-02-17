import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool input schema
const MathOperationsSchema = z.object({
  operation: z.enum(["add", "subtract", "multiply", "divide", "power", "sqrt", "factorial"]).describe("Math operation to perform"),
  a: z.number().describe("First number"),
  b: z.number().optional().describe("Second number (not needed for sqrt, factorial)"),
  precision: z.number().min(0).max(20).optional().describe("Decimal precision for results (default: 2)"),
});

// Tool configuration
const name = "math-operations";
const config = {
  title: "Math Operations Tool",
  description: "Perform mathematical operations including basic arithmetic, power, square root, and factorial",
  inputSchema: MathOperationsSchema,
};

/**
 * Registers the 'math-operations' tool.
 *
 * The registered tool provides various mathematical operations:
 * - add: Add two numbers
 * - subtract: Subtract second number from first
 * - multiply: Multiply two numbers
 * - divide: Divide first number by second
 * - power: Raise first number to power of second
 * - sqrt: Square root of number
 * - factorial: Factorial of number (must be integer >= 0)
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerMathOperationsTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const validatedArgs = MathOperationsSchema.parse(args);
    const precision = validatedArgs.precision || 2;
    let result: number;

    switch (validatedArgs.operation) {
      case "add":
        if (validatedArgs.b === undefined) throw new Error("Second number (b) is required for addition");
        result = validatedArgs.a + validatedArgs.b;
        break;
      case "subtract":
        if (validatedArgs.b === undefined) throw new Error("Second number (b) is required for subtraction");
        result = validatedArgs.a - validatedArgs.b;
        break;
      case "multiply":
        if (validatedArgs.b === undefined) throw new Error("Second number (b) is required for multiplication");
        result = validatedArgs.a * validatedArgs.b;
        break;
      case "divide":
        if (validatedArgs.b === undefined) throw new Error("Second number (b) is required for division");
        if (validatedArgs.b === 0) throw new Error("Division by zero is not allowed");
        result = validatedArgs.a / validatedArgs.b;
        break;
      case "power":
        if (validatedArgs.b === undefined) throw new Error("Second number (b) is required for power operation");
        result = Math.pow(validatedArgs.a, validatedArgs.b);
        break;
      case "sqrt":
        if (validatedArgs.a < 0) throw new Error("Square root of negative numbers is not supported");
        result = Math.sqrt(validatedArgs.a);
        break;
      case "factorial":
        if (!Number.isInteger(validatedArgs.a) || validatedArgs.a < 0) {
          throw new Error("Factorial requires a non-negative integer");
        }
        result = factorial(validatedArgs.a);
        break;
      default:
        throw new Error(`Unknown operation: ${validatedArgs.operation}`);
    }

    const formattedResult = Number.isInteger(result) ? result : Number(result.toFixed(precision));

    return {
      content: [
        {
          type: "text",
          text: `Math operation '${validatedArgs.operation}' result: ${formattedResult}`,
        },
      ],
    };
  });
};

// Helper function for factorial calculation
function factorial(n: number): number {
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}
