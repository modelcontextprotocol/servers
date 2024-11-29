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
interface ListChannelsArgs {
  guild_id: string;
}

interface SendMessageArgs {
  channel_id: string;
  content: string;
}

interface ReplyToMessageArgs {
  channel_id: string;
  message_id: string;
  content: string;
}

interface AddReactionArgs {
  channel_id: string;
  message_id: string;
  emoji: string;
}

interface GetChannelMessagesArgs {
  channel_id: string;
  limit?: number;
}

interface GetGuildMembersArgs {
  guild_id: string;
  limit?: number;
  after?: string;
}

interface GetUserProfileArgs {
  user_id: string;
}

// Tool definitions
const listChannelsTool: Tool = {
  name: "discord_list_channels",
  description: "List channels in a Discord guild",
  inputSchema: {
    type: "object",
    properties: {
      guild_id: {
        type: "string",
        description: "The ID of the guild (server)",
      },
    },
    required: ["guild_id"],
  },
};

const sendMessageTool: Tool = {
  name: "discord_send_message",
  description: "Send a message to a Discord channel",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel to send to",
      },
      content: {
        type: "string",
        description: "The message content",
      },
    },
    required: ["channel_id", "content"],
  },
};

const replyToMessageTool: Tool = {
  name: "discord_reply_to_message",
  description: "Reply to a specific message in Discord",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel containing the message",
      },
      message_id: {
        type: "string",
        description: "The ID of the message to reply to",
      },
      content: {
        type: "string",
        description: "The reply content",
      },
    },
    required: ["channel_id", "message_id", "content"],
  },
};

const addReactionTool: Tool = {
  name: "discord_add_reaction",
  description: "Add a reaction emoji to a message",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel containing the message",
      },
      message_id: {
        type: "string",
        description: "The ID of the message to react to",
      },
      emoji: {
        type: "string",
        description: "The emoji to react with (URL-encoded)",
      },
    },
    required: ["channel_id", "message_id", "emoji"],
  },
};

const getChannelMessagesTool: Tool = {
  name: "discord_get_channel_messages",
  description: "Get recent messages from a channel",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel",
      },
      limit: {
        type: "number",
        description: "Number of messages to retrieve (default 50, max 100)",
        default: 50,
      },
    },
    required: ["channel_id"],
  },
};

const getGuildMembersTool: Tool = {
  name: "discord_get_guild_members",
  description: "Get a list of members in a guild",
  inputSchema: {
    type: "object",
    properties: {
      guild_id: {
        type: "string",
        description: "The ID of the guild",
      },
      limit: {
        type: "number",
        description:
          "Maximum number of members to return (default 50, max 1000)",
        default: 50,
      },
      after: {
        type: "string",
        description: "The highest user ID in the previous page",
      },
    },
    required: ["guild_id"],
  },
};

const getUserProfileTool: Tool = {
  name: "discord_get_user_profile",
  description: "Get user information for a specific user",
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

class DiscordClient {
  private botHeaders: { Authorization: string; "Content-Type": string };

  constructor(botToken: string) {
    this.botHeaders = {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    };
  }

  async listChannels(guild_id: string): Promise<any> {
    const response = await fetch(
      `https://discord.com/api/guilds/${guild_id}/channels`,
      {
        headers: this.botHeaders,
      },
    );

    return response.json();
  }

  async sendMessage(channel_id: string, content: string): Promise<any> {
    const response = await fetch(
      `https://discord.com/api/channels/${channel_id}/messages`,
      {
        method: "POST",
        headers: this.botHeaders,
        body: JSON.stringify({ content }),
      },
    );

    return response.json();
  }

  async replyToMessage(
    channel_id: string,
    message_id: string,
    content: string,
  ): Promise<any> {
    const response = await fetch(
      `https://discord.com/api/channels/${channel_id}/messages`,
      {
        method: "POST",
        headers: this.botHeaders,
        body: JSON.stringify({
          content,
          message_reference: {
            message_id,
          },
        }),
      },
    );

    return response.json();
  }

  async addReaction(
    channel_id: string,
    message_id: string,
    emoji: string,
  ): Promise<any> {
    const encodedEmoji = encodeURIComponent(emoji);
    const response = await fetch(
      `https://discord.com/api/channels/${channel_id}/messages/${message_id}/reactions/${encodedEmoji}/@me`,
      {
        method: "PUT",
        headers: this.botHeaders,
      },
    );

    return response.ok
      ? { success: true }
      : { success: false, error: await response.json() };
  }

  async getChannelMessages(
    channel_id: string,
    limit: number = 50,
  ): Promise<any> {
    const params = new URLSearchParams({
      limit: Math.min(limit, 100).toString(),
    });

    const response = await fetch(
      `https://discord.com/api/channels/${channel_id}/messages?${params}`,
      {
        headers: this.botHeaders,
      },
    );

    return response.json();
  }

  async getGuildMembers(
    guild_id: string,
    limit: number = 50,
    after?: string,
  ): Promise<any> {
    const params = new URLSearchParams({
      limit: Math.min(limit, 1000).toString(),
    });

    if (after) {
      params.append("after", after);
    }

    const response = await fetch(
      `https://discord.com/api/guilds/${guild_id}/members?${params}`,
      {
        headers: this.botHeaders,
      },
    );

    return response.json();
  }

  async getUserProfile(user_id: string): Promise<any> {
    const response = await fetch(`https://discord.com/api/users/${user_id}`, {
      headers: this.botHeaders,
    });

    return response.json();
  }
}

async function main() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!botToken) {
    console.error("Please set DISCORD_BOT_TOKEN environment variable");
    process.exit(1);
  }

  console.error("Starting Discord MCP Server...");
  const server = new Server(
    {
      name: "Discord MCP Server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const discordClient = new DiscordClient(botToken);

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      console.error("Received CallToolRequest:", request);
      try {
        if (!request.params.arguments) {
          throw new Error("No arguments provided");
        }

        switch (request.params.name) {
          case "discord_list_channels": {
            const args = request.params.arguments as unknown as ListChannelsArgs;
            if (!args.guild_id) {
              throw new Error("Missing required argument: guild_id");
            }
            const response = await discordClient.listChannels(args.guild_id);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "discord_send_message": {
            const args = request.params.arguments as unknown as SendMessageArgs;
            if (!args.channel_id || !args.content) {
              throw new Error(
                "Missing required arguments: channel_id and content",
              );
            }
            const response = await discordClient.sendMessage(
              args.channel_id,
              args.content,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "discord_reply_to_message": {
            const args = request.params
              .arguments as unknown as ReplyToMessageArgs;
            if (!args.channel_id || !args.message_id || !args.content) {
              throw new Error(
                "Missing required arguments: channel_id, message_id, and content",
              );
            }
            const response = await discordClient.replyToMessage(
              args.channel_id,
              args.message_id,
              args.content,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "discord_add_reaction": {
            const args = request.params.arguments as unknown as AddReactionArgs;
            if (!args.channel_id || !args.message_id || !args.emoji) {
              throw new Error(
                "Missing required arguments: channel_id, message_id, and emoji",
              );
            }
            const response = await discordClient.addReaction(
              args.channel_id,
              args.message_id,
              args.emoji,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "discord_get_channel_messages": {
            const args = request.params
              .arguments as unknown as GetChannelMessagesArgs;
            if (!args.channel_id) {
              throw new Error("Missing required argument: channel_id");
            }
            const response = await discordClient.getChannelMessages(
              args.channel_id,
              args.limit,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "discord_get_guild_members": {
            const args = request.params
              .arguments as unknown as GetGuildMembersArgs;
            if (!args.guild_id) {
              throw new Error("Missing required argument: guild_id");
            }
            const response = await discordClient.getGuildMembers(
              args.guild_id,
              args.limit,
              args.after,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "discord_get_user_profile": {
            const args = request.params
              .arguments as unknown as GetUserProfileArgs;
            if (!args.user_id) {
              throw new Error("Missing required argument: user_id");
            }
            const response = await discordClient.getUserProfile(args.user_id);
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
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error("Received ListToolsRequest");
    return {
      tools: [
        listChannelsTool,
        sendMessageTool,
        replyToMessageTool,
        addReactionTool,
        getChannelMessagesTool,
        getGuildMembersTool,
        getUserProfileTool,
      ],
    };
  });

  const transport = new StdioServerTransport();
  console.error("Connecting server to transport...");
  await server.connect(transport);

  console.error("Discord MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
