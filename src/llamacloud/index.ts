#!/usr/bin/env node

/**
 * This is a MCP server that connects to a managed index on LlamaCloud.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LlamaCloudIndex, MetadataMode } from 'llamaindex';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";


/**
 * Create an MCP server with capabilities for tools
 */
const server = new Server(
  {
    name: "llamacloud-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const index = new LlamaCloudIndex({
  name: process.env.LLAMA_CLOUD_INDEX_NAME || (() => { throw new Error('LLAMA_CLOUD_INDEX_NAME is not set') })(),
  projectName: process.env.LLAMA_CLOUD_PROJECT_NAME || (() => { throw new Error('LLAMA_CLOUD_PROJECT_NAME is not set') })(),
  apiKey: process.env.LLAMA_CLOUD_API_KEY || (() => { throw new Error('LLAMA_CLOUD_API_KEY is not set') })(),
});

/**
 * Handler that lists available tools.
 * Exposes a single "get_information" tool that lets clients retrieve information from the LlamaIndex.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_information",
        description: "Get information from your knowledge base to answer questions.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The query used to get information about your knowledge base."
            },
          },
          required: ["query"]
        }
      }
    ]
  };
});

/**
 * Handler for the get_information tool.
 * Retrieves information from the LlamaIndex and returns the result as text.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "get_information": {
      const query = String(request.params.arguments?.query);
      if (!query) {
        throw new Error("query parameter is required");
      }

      const retriever = index.asRetriever();
      const nodesWithScore = await retriever.retrieve({ query });

      const nodes = nodesWithScore.map((node) => node.node);
      const context = nodes.map((r) => r.getContent(MetadataMode.NONE)).join("\n\n");

      return {
        content: [{
          type: "text",
          text: context,
        }]
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});



/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
