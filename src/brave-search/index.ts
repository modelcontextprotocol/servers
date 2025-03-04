#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import tools from "./tools.js";
import { handleRequest as handleImageSearchRequest } from "./tools/imageSearch.js";
import { handleRequest as handleWebSearchRequest } from "./tools/webSearch.js";
import { handleRequest as handleLocalSearchRequest } from "./tools/localSearch.js";
import { checkEnvVariables } from "./env.js";

// Server implementation
const server = new Server(
  {
    name: "example-servers/brave-search",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Check for API key
checkEnvVariables();

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "brave_web_search":
        return handleWebSearchRequest(args);
      case "brave_local_search":
        return handleLocalSearchRequest(args);
      case "brave_image_search":
        return handleImageSearchRequest(args);
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Brave Search MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
