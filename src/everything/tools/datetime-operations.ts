import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool input schema
const DateTimeOperationsSchema = z.object({
  operation: z.enum(["current", "format", "add", "subtract", "diff", "timezone"]).describe("Date/time operation to perform"),
  datetime: z.string().optional().describe("Date/time string (ISO format) - not needed for 'current' operation"),
  format: z.string().optional().describe("Output format string (e.g., 'YYYY-MM-DD HH:mm:ss')"),
  amount: z.number().optional().describe("Amount to add/subtract"),
  unit: z.enum(["seconds", "minutes", "hours", "days"]).optional().describe("Unit for add/subtract operations"),
  timezone: z.string().optional().describe("Timezone for conversion (e.g., 'UTC', 'America/New_York')"),
});

// Tool configuration
const name = "datetime-operations";
const config = {
  title: "Date/Time Operations Tool",
  description: "Perform date and time operations including formatting, arithmetic, and timezone conversions",
  inputSchema: DateTimeOperationsSchema,
};

/**
 * Registers the 'datetime-operations' tool.
 *
 * The registered tool provides various date/time operations:
 * - current: Get current date/time
 * - format: Format date/time string
 * - add: Add time to date
 * - subtract: Subtract time from date
 * - diff: Calculate difference between two dates
 * - timezone: Convert between timezones
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerDateTimeOperationsTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const validatedArgs = DateTimeOperationsSchema.parse(args);
    let result: string;

    switch (validatedArgs.operation) {
      case "current":
        result = new Date().toISOString();
        break;
      case "format":
        if (!validatedArgs.datetime) throw new Error("Date/time is required for formatting");
        result = formatDateTime(new Date(validatedArgs.datetime), validatedArgs.format);
        break;
      case "add":
        if (!validatedArgs.datetime) throw new Error("Date/time is required for addition");
        if (!validatedArgs.amount || !validatedArgs.unit) throw new Error("Amount and unit are required for addition");
        result = addTime(new Date(validatedArgs.datetime), validatedArgs.amount, validatedArgs.unit).toISOString();
        break;
      case "subtract":
        if (!validatedArgs.datetime) throw new Error("Date/time is required for subtraction");
        if (!validatedArgs.amount || !validatedArgs.unit) throw new Error("Amount and unit are required for subtraction");
        result = subtractTime(new Date(validatedArgs.datetime), validatedArgs.amount, validatedArgs.unit).toISOString();
        break;
      case "diff":
        if (!validatedArgs.datetime) throw new Error("Date/time is required for difference calculation");
        const diffMs = Date.now() - new Date(validatedArgs.datetime).getTime();
        const diffHours = Math.abs(diffMs / (1000 * 60 * 60));
        const diffDays = Math.abs(diffMs / (1000 * 60 * 60 * 24));
        result = `Difference: ${diffHours.toFixed(2)} hours (${diffDays.toFixed(2)} days)`;
        break;
      case "timezone":
        if (!validatedArgs.datetime) throw new Error("Date/time is required for timezone conversion");
        if (!validatedArgs.timezone) throw new Error("Timezone is required for conversion");
        result = convertTimezone(new Date(validatedArgs.datetime), validatedArgs.timezone);
        break;
      default:
        throw new Error(`Unknown operation: ${validatedArgs.operation}`);
    }

    return {
      content: [
        {
          type: "text",
          text: `DateTime operation '${validatedArgs.operation}' result: ${result}`,
        },
      ],
    };
  });
};

// Helper functions
function formatDateTime(date: Date, format?: string): string {
  if (!format) {
    return date.toISOString();
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

function addTime(date: Date, amount: number, unit: string): Date {
  const result = new Date(date);
  switch (unit) {
    case "seconds":
      result.setSeconds(result.getSeconds() + amount);
      break;
    case "minutes":
      result.setMinutes(result.getMinutes() + amount);
      break;
    case "hours":
      result.setHours(result.getHours() + amount);
      break;
    case "days":
      result.setDate(result.getDate() + amount);
      break;
  }
  return result;
}

function subtractTime(date: Date, amount: number, unit: string): Date {
  return addTime(date, -amount, unit);
}

function convertTimezone(date: Date, timezone: string): string {
  // Simple timezone conversion (in a real implementation, you'd use a proper timezone library)
  try {
    return date.toLocaleString('en-US', { timeZone: timezone });
  } catch (error) {
    return date.toISOString(); // Fallback to ISO string if timezone is invalid
  }
}
