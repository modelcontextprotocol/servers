import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool input schema
const DataAnalysisSchema = z.object({
  operation: z.enum(["stats", "sort", "filter", "unique", "sum", "average", "median", "min", "max"]).describe("Data analysis operation"),
  data: z.union([z.array(z.number()), z.array(z.string())]).describe("Array of numbers or strings to analyze"),
  condition: z.string().optional().describe("Filter condition (for filter operation)"),
  order: z.enum(["asc", "desc"]).optional().describe("Sort order (for sort operation)"),
  property: z.string().optional().describe("Property to extract from objects (if data contains objects)"),
});

// Tool configuration
const name = "data-analysis";
const config = {
  title: "Data Analysis Tool",
  description: "Perform data analysis operations including statistics, sorting, filtering, and aggregations",
  inputSchema: DataAnalysisSchema,
};

/**
 * Registers the 'data-analysis' tool.
 *
 * The registered tool provides various data analysis operations:
 * - stats: Basic statistics (count, sum, average, min, max)
 * - sort: Sort array ascending or descending
 * - filter: Filter array based on condition
 * - unique: Get unique values from array
 * - sum: Calculate sum of numbers
 * - average: Calculate average of numbers
 * - median: Calculate median of numbers
 * - min: Find minimum value
 * - max: Find maximum value
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerDataAnalysisTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const validatedArgs = DataAnalysisSchema.parse(args);
    let result: any;

    switch (validatedArgs.operation) {
      case "stats":
        result = calculateStats(validatedArgs.data);
        break;
      case "sort":
        result = sortArray(validatedArgs.data, validatedArgs.order);
        break;
      case "filter":
        if (!validatedArgs.condition) throw new Error("Condition is required for filtering");
        result = filterArray(validatedArgs.data, validatedArgs.condition);
        break;
      case "unique":
        result = getUniqueValues(validatedArgs.data);
        break;
      case "sum":
        result = calculateSum(validatedArgs.data);
        break;
      case "average":
        result = calculateAverage(validatedArgs.data);
        break;
      case "median":
        result = calculateMedian(validatedArgs.data);
        break;
      case "min":
        const numbers = validatedArgs.data.filter(item => typeof item === 'number') as number[];
        if (numbers.length === 0) throw new Error("No numeric data found for min operation");
        result = Math.min(...numbers);
        break;
      case "max":
        const numbersMax = validatedArgs.data.filter(item => typeof item === 'number') as number[];
        if (numbersMax.length === 0) throw new Error("No numeric data found for max operation");
        result = Math.max(...numbersMax);
        break;
      default:
        throw new Error(`Unknown operation: ${validatedArgs.operation}`);
    }

    return {
      content: [
        {
          type: "text",
          text: `Data analysis '${validatedArgs.operation}' result: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  });
};

// Helper functions
function calculateStats(data: any[]): any {
  const numbers = data.filter(item => typeof item === 'number') as number[];
  if (numbers.length === 0) {
    return { count: data.length, note: "No numeric data found" };
  }

  return {
    count: numbers.length,
    sum: calculateSum(numbers),
    average: calculateAverage(numbers),
    median: calculateMedian(numbers),
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    totalItems: data.length
  };
}

function sortArray(data: any[], order?: "asc" | "desc"): any[] {
  const sorted = [...data].sort((a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  return order === "desc" ? sorted.reverse() : sorted;
}

function filterArray(data: any[], condition: string): any[] {
  // Simple filter implementation - in a real scenario, you'd parse the condition
  try {
    // Try to evaluate condition as a JavaScript expression
    const filterFn = new Function('item', `return ${condition}`) as (item: any) => boolean;
    return data.filter(filterFn);
  } catch (error) {
    // Fallback to string matching
    return data.filter(item => String(item).includes(condition));
  }
}

function getUniqueValues(data: any[]): any[] {
  return [...new Set(data)];
}

function calculateSum(data: number[] | string[]): number {
  const nums = data.filter(n => typeof n === 'number') as number[];
  return nums.reduce((sum, num) => sum + num, 0);
}

function calculateAverage(data: number[] | string[]): number {
  const nums = data.filter(n => typeof n === 'number') as number[];
  if (nums.length === 0) return 0;
  return calculateSum(nums) / nums.length;
}

function calculateMedian(data: number[] | string[]): number {
  const nums = data.filter(n => typeof n === 'number').sort((a, b) => a - b) as number[];
  if (nums.length === 0) return 0;

  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 0) {
    return (nums[mid - 1] + nums[mid]) / 2;
  } else {
    return nums[mid];
  }
}
