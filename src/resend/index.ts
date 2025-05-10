#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from 'zod-to-json-schema';

import * as email from './operations/email.js';
import { isResendError } from './common/errors.js';
import { VERSION } from "./common/version.js";

const server = new Server(
  {
    name: "resend-mcp-server",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

function formatResendError(error: Error): string {
  let message = `Resend API Error: ${error.message}`;
  
  if (isResendError(error)) {
    message = `Resend Error: ${error.message}`;
    if (error.response) {
      message += `\nDetails: ${JSON.stringify(error.response)}`;
    }
  }

  return message;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "send_email",
        description: "Send an email using Resend API",
        inputSchema: zodToJsonSchema(email.SendEmailSchema),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case "send_email": {
        const args = email.SendEmailSchema.parse(request.params.arguments);
        const result = await email.sendEmail(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    console.error("Error:", error);
    let errorMessage = error instanceof Error ? error.message : String(error);
    
    if (isResendError(error)) {
      errorMessage = formatResendError(error);
    }
    
    return {
      content: [{ type: "text", text: JSON.stringify({ error: errorMessage }, null, 2) }],
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Resend MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal server error:", error);
  process.exit(1);
}); 