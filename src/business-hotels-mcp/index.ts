import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Initialize the BusinessHotels MCP Server
 */
const server = new Server(
  {
    name: "business-hotels-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Tool Listing:
 * This tells the AI what capabilities are available.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_live_hotel_rates",
        description: "Get live hotel rates by hotel name, dates, adults, and currency.",
        inputSchema: {
          type: "object",
          properties: {
            hotelName: {
              type: "string",
              description: "Full hotel name, ideally with city/state/country."
            },
            checkinDate: {
              type: "string",
              description: "Check-in date (YYYY-MM-DD)"
            },
            checkoutDate: {
              type: "string",
              description: "Check-out date (YYYY-MM-DD)"
            },
            adults: {
              type: "integer",
              minimum: 1,
              default: 2
            },
            currency: {
              type: "string",
              default: "USD"
            }
          },
          required: ["hotelName", "checkinDate", "checkoutDate"]
        }
      }
    ]
  };
});

/**
 * Tool Execution:
 * Connects the AI request to your live PHP backend.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_live_hotel_rates") {
    const args = request.params.arguments as any;
    
    try {
      // Build the URL for your mcp-server.php endpoint
      const url = new URL("https://www.businesshotels.com/mcp-server.php");
      url.searchParams.append("route", "tools");
      url.searchParams.append("hotel", args.hotelName);
      url.searchParams.append("checkin", args.checkinDate);
      url.searchParams.append("checkout", args.checkoutDate);
      url.searchParams.append("adults", (args.adults || 2).toString());
      url.searchParams.append("currency", args.currency || "USD");

      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2)
          }
        ]
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error fetching rates from BusinessHotels: ${error.message}`
          }
        ]
      };
    }
  }
  throw new Error("Tool not found");
});

/**
 * Start the server using Standard Input/Output
 */
const transport = new StdioServerTransport();
await server.connect(transport);
