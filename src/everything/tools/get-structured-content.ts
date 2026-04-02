import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";

// Tool input schema
const GetStructuredContentInputSchema = {
  location: z
    .enum(["New York", "Chicago", "Los Angeles"])
    .describe("Choose city"),
};

// Tool output schema
const GetStructuredContentOutputSchema = z.object({
  temperature: z.number().describe("Temperature in celsius"),
  conditions: z.string().describe("Weather conditions description"),
  humidity: z.number().describe("Humidity percentage"),
});

// Tool configuration
const name = "get-structured-content";
const config = {
  title: "Get Structured Content Tool",
  description:
    "Returns structured content along with an output schema for client data validation",
  inputSchema: GetStructuredContentInputSchema,
  outputSchema: GetStructuredContentOutputSchema,
};

/**
 * Registers the 'get-structured-content' tool.
 *
 * The registered tool processes incoming arguments using a predefined input schema,
 * generates structured content with weather information including temperature,
 * conditions, and humidity, and returns both backward-compatible content blocks
 * and structured content in the response.
 *
 * The response contains:
 * - `content`: An array of content blocks, presented as JSON stringified objects.
 * - `structuredContent`: A JSON structured representation of the weather data.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetStructuredContentTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    // Get simulated weather for the chosen city
    let weather;
    switch (args.location) {
      case "New York":
        weather = {
          temperature: 33,
          conditions: "Cloudy",
          humidity: 82,
        };
        break;

      case "Chicago":
        weather = {
          temperature: 36,
          conditions: "Light rain / drizzle",
          humidity: 82,
        };
        break;

      case "Los Angeles":
        weather = {
          temperature: 73,
          conditions: "Sunny / Clear",
          humidity: 48,
        };
        break;
    }

    const backwardCompatibleContentBlock: ContentBlock = {
      type: "text",
      text: JSON.stringify(weather),
    };

    return {
      content: [backwardCompatibleContentBlock],
      structuredContent: weather,
    };
  });
};
