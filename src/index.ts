import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";

/**
 * Initialize the BusinessHotels MCP Server
 * Version 2.0.0 aligned with Agentic Discovery Endpoints
 */
const server = new McpServer({
  name: "business-hotels-mcp",
  version: "2.0.2",
});

/**
 * Tool: get_live_hotel_rates
 * Connects to the PHP tools route for real-time ARI data.
 */
server.tool(
  "get_live_hotel_rates",
  {
    hotelName: z.string().describe("Hotel name only, NO COMMAS (e.g. Marriott Marquis San Francisco US)"),
    checkinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Check-in date in YYYY-MM-DD format"),
    checkoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Check-out date in YYYY-MM-DD format"),
    adults: z.number().min(1).max(4).optional().default(2),
    currency: z.string().length(3).optional().default("USD"),
  },
  async ({ hotelName, checkinDate, checkoutDate, adults, currency }) => {
    try {
      // Connects to your unified PHP tools route
      const response = await axios.get("https://www.businesshotels.com/mcp-server.php", {
        params: {
          route: "tools",
          hotelName,
          checkinDate,
          checkoutDate,
          adults,
          currency,
          // Using the live test key from your tool-config.html
          apiKey: "test-live-hotel-rates2025" 
        },
        timeout: 5000 // Optimized for your sub-2-second response goal
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `API Error: ${error.message}`,
          },
        ],
      };
    }
  }
);

/**
 * Main execution block using Stdio transport
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BusinessHotels Agentic MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal Server Error:", error);
  process.exit(1);
});
