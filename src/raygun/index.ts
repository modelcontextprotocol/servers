#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {z} from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {RaygunAPIV3Client, RaygunError} from "./raygun.js";
import path from "node:path";
import {ToolHandler} from "./types.js";
import {toolRegistry} from "./tool-repository.js";

if (!process.env.RAYGUN_PAT_TOKEN) {
  throw new Error("RAYGUN_PAT_TOKEN environment variable must be set");
}

export const raygunAPIV3Client = new RaygunAPIV3Client({
  baseUrl: "https://api.raygun.com/v3",
  apiKey: process.env.RAYGUN_PAT_TOKEN
});

export const allowedDirectories = process.env.SOURCEMAP_ALLOWED_DIRS ?
    process.env.SOURCEMAP_ALLOWED_DIRS.split(',').map(dir =>
        path.normalize(dir).toLowerCase()
    ) : [];

const server = new Server(
  {
    name: "raygun-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

const handleToolCall = async <T>(
    toolName: string,
    args: any,
    schema: z.ZodType<T>,
    handler: ToolHandler<T>
) => {
  try {
    const validatedArgs = schema.parse(args);
    const result = await handler(validatedArgs);

    return {
      content: [
        {
          type: "text",
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    // Convert any error to a text response starting with "Error:"
    const errorMessage = error instanceof RaygunError
        ? `Error: Failed to ${toolName}: ${error.message} with status code: ${error.status} and details ${JSON.stringify(error.details)}`
        : `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;

    return {
      content: [
        {
          type: "text",
          text: errorMessage,
        },
      ],
    };
  }
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: toolRegistry.getAllTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.schema),
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = toolRegistry.getTool(name);

  if (!tool) {
    return {
      content: [
        {
          type: "text",
          text: `Error: Unknown tool: ${name}`,
        },
      ],
    };
  }

  return handleToolCall(name, args, tool.schema, tool.handler);
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Raygun MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
