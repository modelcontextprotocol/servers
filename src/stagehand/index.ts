#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  CallToolResult,
  TextContent,
  ImageContent,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { Stagehand } from "@browserbasehq/stagehand";
import { AnyZodObject, z } from "zod";


// Define the Stagehand tools
const TOOLS: Tool[] = [
  {
    name: "stagehand_navigate",
    description: "Navigate to a URL in the browser",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to navigate to" }
      },
      required: ["url"]
    }
  },
  {
    name: "stagehand_act",
    description: "Performs an action on the web page",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "The action to perform" },
        variables: {
          type: "object",
          additionalProperties: true,
          description: "Variables used in the action template",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "stagehand_extract",
    description: "Extracts data from the web page based on an instruction and schema",
    inputSchema: {
      type: "object",
      properties: {
        instruction: { type: "string", description: "Instruction for extraction" },
        schema: {
          type: "object",
          description: "JSON schema for the extracted data",
          additionalProperties: true,
        },
      },
      required: ["instruction", "schema"],
    },
  },
  {
    name: "stagehand_observe",
    description: "Observes actions that can be performed on the web page",
    inputSchema: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description: "Instruction for observation",
        },
      },
    },
  },
];


// Global state
let stagehand: Stagehand | undefined;
const consoleLogs: string[] = [];
const operationLogs: string[] = [];

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  operationLogs.push(logMessage);
}

// Ensure Stagehand is initialized
async function ensureStagehand() {
  log("Ensuring Stagehand is initialized...");
  
  if (!stagehand) {
    log("Initializing Stagehand...");
    stagehand = new Stagehand({
      env: "BROWSERBASE",
      headless: true,
      verbose: 2,
      debugDom: true,
    });
    log("Running init()");
    await stagehand.init();
    log("Stagehand initialized successfully");
  }
  return stagehand;
}

// Handle tool calls
async function handleToolCall(
  name: string,
  args: any
): Promise<{ toolResult: CallToolResult }> {
  log(`Handling tool call: ${name} with args: ${JSON.stringify(args)}`);

  try {
    stagehand = await ensureStagehand();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`Failed to initialize Stagehand: ${errorMsg}`);
    return {
      toolResult: {
        content: [
          {
            type: "text", 
            text: `Failed to initialize Stagehand: ${errorMsg}`,
          },
          {
            type: "text",
            text: `Operation logs:\n${operationLogs.join("\n")}`,
          }
        ],
        isError: true,
      },
    };
  }

  switch (name) {
    case "stagehand_navigate":
      try {
        log(`Navigating to URL: ${args.url}`);
        await stagehand.page.goto(args.url);
        log("Navigation successful");
        return {
          toolResult: {
            content: [
              {
                type: "text",
                text: `Navigated to: ${args.url}`,
              },
            ],
            isError: false,
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Navigation failed: ${errorMsg}`);
        return {
          toolResult: {
            content: [
              {
                type: "text",
                text: `Failed to navigate: ${errorMsg}`,
              },
              {
                type: "text",
                text: `Operation logs:\n${operationLogs.join("\n")}`,
              }
            ],
            isError: true,
          },
        };
      }

    case "stagehand_act":
      try {
        log(`Performing action: ${args.action}`);
        await stagehand.act({
          action: args.action,
          variables: args.variables,
        });
        log("Action completed successfully");
        return {
          toolResult: {
            content: [
              {
                type: "text",
                text: `Action performed: ${args.action}`,
              },
            ],
            isError: false,
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Action failed: ${errorMsg}`);
        return {
          toolResult: {
            content: [
              {
                type: "text",
                text: `Failed to perform action: ${errorMsg}`,
              },
              {
                type: "text",
                text: `Operation logs:\n${operationLogs.join("\n")}`,
              }
            ],
            isError: true,
          },
        };
      }

    case "stagehand_extract":
      try {
        log(`Extracting data with instruction: ${args.instruction}`);
        // Convert the JSON schema from args.schema to a zod schema
        const schema = z.object(args.schema);
        const data = await stagehand.extract({
          instruction: args.instruction,
          schema,
        });
        log(`Data extracted successfully: ${JSON.stringify(data)}`);
        return {
          toolResult: {
            content: [
              {
                type: "text",
                text: `Extraction result: ${JSON.stringify(data)}`,
              },
            ],
            isError: false,
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Extraction failed: ${errorMsg}`);
        return {
          toolResult: {
            content: [
              {
                type: "text",
                text: `Failed to extract: ${errorMsg}`,
              },
              {
                type: "text",
                text: `Operation logs:\n${operationLogs.join("\n")}`,
              }
            ],
            isError: true,
          },
        };
      }

    case "stagehand_observe":
      try {
        log(`Starting observation with instruction: ${args.instruction}`);
        const observations = await stagehand.observe({
          instruction: args.instruction,
        });
        log(`Observation completed successfully: ${JSON.stringify(observations)}`);
        return {
          toolResult: {
            content: [
              {
                type: "text",
                text: `Observations: ${JSON.stringify(observations)}`,
              },
            ],
            isError: false,
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Observation failed: ${errorMsg}`);
        return {
          toolResult: {
            content: [
              {
                type: "text",
                text: `Failed to observe: ${errorMsg}`,
              },
              {
                type: "text",
                text: `Operation logs:\n${operationLogs.join("\n")}`,
              }
            ],
            isError: true,
          },
        };
      }

    default:
      log(`Unknown tool called: ${name}`);
      return {
        toolResult: {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
            {
              type: "text",
              text: `Operation logs:\n${operationLogs.join("\n")}`,
            }
          ],
          isError: true,
        },
      };
  }
}

// Create the server
const server = new Server(
  {
    name: "stagehand",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);


// Setup request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  log("Listing available tools");
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  log(`Received tool call request for: ${request.params.name}`);
  operationLogs.length = 0; // Clear logs for new operation
  const result = await handleToolCall(request.params.name, request.params.arguments ?? {});
  log("Tool call completed");
  return result;
});

// Run the server
async function runServer() {
  log("Starting Stagehand MCP server...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("Server started successfully");
}

runServer().catch((error) => {
  log(`Server error: ${error instanceof Error ? error.message : String(error)}`);
  console.error(error);
});