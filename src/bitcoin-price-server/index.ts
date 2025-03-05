#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

// Define the tool for fetching the latest bitcoin price
const FETCH_BITCOIN_PRICE_TOOL: Tool = {
  name: "fetch_bitcoin_price",
  description: "Fetches the latest bitcoin price from the CoinGecko API.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

// Server setup
const server = new Server(
  {
    name: "bitcoin-price-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [FETCH_BITCOIN_PRICE_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  if (name === "fetch_bitcoin_price") {
    try {
      const response = await axios.get(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
      );
      const price = response.data.bitcoin.usd;
      return {
        content: [{ type: "text", text: `The current price of Bitcoin is $${price}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching bitcoin price: ${error}` }],
      };
    }
  } else {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
});

// Server startup
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bitcoin Price MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
