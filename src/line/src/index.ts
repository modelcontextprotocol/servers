#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Type definitions for tool arguments
interface SendMessageArgs {
  user_id: string;
  message: string;
}

interface GetUserProfileArgs {
  user_id: string;
}

// Tool definitions
const sendMessageTool: Tool = {
  name: "line_send_message",
  description: "Send a message to a LINE user",
  inputSchema: {
    type: "object",
    properties: {
      user_id: {
        type: "string",
        description: "The ID of the user to send to",
      },
      message: {
        type: "string",
        description: "The message content",
      },
    },
    required: ["user_id", "message"],
  },
};

const getUserProfileTool: Tool = {
  name: "line_get_profile",
  description: "Get profile information of a LINE user",
  inputSchema: {
    type: "object",
    properties: {
      user_id: {
        type: "string",
        description: "The ID of the user",
      },
    },
    required: ["user_id"],
  },
};

class LINEClient {
  private channelAccessToken: string;
  private headers: { Authorization: string; "Content-Type": string };
  private baseUrl = "https://api.line.me/v2/bot";

  constructor(channelAccessToken: string) {
    this.channelAccessToken = channelAccessToken;
    this.headers = {
      Authorization: `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json",
    };
  }

  async sendMessage(userId: string, message: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/message/push`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        to: userId,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      }),
    });

    return response.json();
  }

  async getProfile(userId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/profile/${userId}`, {
      headers: this.headers,
    });

    return response.json();
  }
}

async function main() {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelAccessToken) {
    console.error("Please set LINE_CHANNEL_ACCESS_TOKEN environment variable");
    process.exit(1);
  }

  console.error("Starting LINE MCP Server...");
  const server = new Server(
    {
      name: "LINE MCP Server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const lineClient = new LINEClient(channelAccessToken);

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      console.error("Received CallToolRequest:", request);
      try {
        if (!request.params.arguments) {
          throw new Error("No arguments provided");
        }

        switch (request.params.name) {
          case "line_send_message": {
            const args = request.params.arguments as unknown as SendMessageArgs;
            if (!args.user_id || !args.message) {
              throw new Error("Missing required arguments: user_id and message");
            }
            const response = await lineClient.sendMessage(
              args.user_id,
              args.message
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "line_get_profile": {
            const args = request.params.arguments as unknown as GetUserProfileArgs;
            if (!args.user_id) {
              throw new Error("Missing required argument: user_id");
            }
            const response = await lineClient.getProfile(args.user_id);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        console.error("Error executing tool:", error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        };
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error("Received ListToolsRequest");
    return {
      tools: [sendMessageTool, getUserProfileTool],
    };
  });

  const transport = new StdioServerTransport();
  console.error("Connecting server to transport...");
  await server.connect(transport);

  console.error("LINE MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});