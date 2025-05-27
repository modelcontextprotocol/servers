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
  limit?: number;
  cursor?: string;
}

interface PostMessageArgs {
  channel_id: string;
  text: string;
}

interface ReplyToThreadArgs {
  channel_id: string;
  thread_ts: string;
  text: string;
}

interface AddReactionArgs {
  channel_id: string;
  timestamp: string;
  reaction: string;
}

interface GetChannelHistoryArgs {
  channel_id: string;
  limit?: number;
}

interface GetThreadRepliesArgs {
  channel_id: string;
  thread_ts: string;
}

interface GetUsersArgs {
  cursor?: string;
  limit?: number;
}

interface GetUserProfileArgs {
  user_id: string;
}

// Canvas access delete
interface CanvasesAccessDeleteArgs {
  canvas_id: string;
  channel_ids?: string[];
  user_ids?: string[];
}

// Canvas access set
interface CanvasesAccessSetArgs {
  canvas_id: string;
  access_level: "read" | "write";
  channel_ids?: string[];
  user_ids?: string[];
}

// Canvas create
interface CanvasesCreateArgs {
  title: string;
  document_content?: object; // Consider refining with a more specific type if needed
  ownership_details?: {
    channel_id?: string;
    user_id?: string;
  };
}

interface CanvasesCreateResponse {
  ok: boolean;
  canvas_id: string;
  title: string;
  file_id: string;
  owner_id: string;
  date_created: number;
  date_updated: number;
  is_private_share: boolean;
  is_public_share: boolean;
  is_org_shared: boolean;
  is_team_shared: boolean;
  is_external_shared: boolean;
  channel_actions_ts: string;
  channel_actions_count: number;
  editors: string[];
  permissions: object; // Consider refining with a more specific type if needed
  access: string;
  url_private: string;
  url_private_download: string;
  app_id?: string; // Marked as optional as it might not always be present
  app_name?: string; // Marked as optional as it might not always be present
}

// Canvas delete
interface CanvasesDeleteArgs {
  canvas_id: string;
}

// Canvas edit
interface CanvasesEditArgs {
  canvas_id: string;
  changes: object[]; // Consider refining with a more specific type if needed
}

// Canvas sections lookup
interface CanvasesSectionsLookupArgs {
  canvas_id: string;
  criteria: object; // Consider refining with a more specific type if needed
}

interface CanvasesSectionsLookupResponse {
  ok: boolean;
  sections: Array<{
    id: string;
    type: string;
    canvas_id: string;
    parent_id: string;
    owner_id: string;
    date_created: number;
    date_updated: number;
    access: string;
    permissions: object; // Consider refining with a more specific type if needed
    team_id: string;
    is_empty: boolean;
    title?: string; // Marked as optional as it might not always be present
    markdown?: string; // Marked as optional as it might not always be present
  }>;
}

// Conversations canvases create
interface ConversationsCanvasesCreateArgs {
  channel_id: string;
  document_content?: object; // Consider refining with a more specific type if needed
}

// Tool definitions
const listChannelsTool: Tool = {
  name: "slack_list_channels",
  description: "List public or pre-defined channels in the workspace with pagination",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description:
          "Maximum number of channels to return (default 100, max 200)",
        default: 100,
      },
      cursor: {
        type: "string",
        description: "Pagination cursor for next page of results",
      },
    },
  },
};

const conversationsCanvasesCreateTool: Tool = {
  name: "slack_conversations_canvases_create",
  description: "Create a new canvas for a conversation.",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The channel ID to create the canvas in.",
      },
      document_content: {
        type: "object",
        description: "The content of the canvas document. See Slack API documentation for structure.",
      },
    },
    required: ["channel_id"],
  },
};

const canvasesSectionsLookupTool: Tool = {
  name: "slack_canvases_sections_lookup",
  description: "Look up sections in a canvas based on criteria.",
  inputSchema: {
    type: "object",
    properties: {
      canvas_id: {
        type: "string",
        description: "The ID of the canvas to search sections in.",
      },
      criteria: {
        type: "object",
        description: "The criteria to filter sections by. See Slack API documentation for structure.",
      },
    },
    required: ["canvas_id", "criteria"],
  },
};

const canvasesEditTool: Tool = {
  name: "slack_canvases_edit",
  description: "Edit a canvas document.",
  inputSchema: {
    type: "object",
    properties: {
      canvas_id: {
        type: "string",
        description: "The ID of the canvas to edit.",
      },
      changes: {
        type: "array",
        items: {
          type: "object",
        },
        description: "A list of change operations to apply to the canvas. See Slack API documentation for structure.",
      },
    },
    required: ["canvas_id", "changes"],
  },
};

const canvasesDeleteTool: Tool = {
  name: "slack_canvases_delete",
  description: "Delete a canvas.",
  inputSchema: {
    type: "object",
    properties: {
      canvas_id: {
        type: "string",
        description: "The ID of the canvas to delete.",
      },
    },
    required: ["canvas_id"],
  },
};

const canvasesCreateTool: Tool = {
  name: "slack_canvases_create",
  description: "Create a new canvas.",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "The title of the canvas.",
      },
      document_content: {
        type: "object",
        description: "The content of the canvas document. See Slack API documentation for structure.",
      },
      ownership_details: {
        type: "object",
        properties: {
          channel_id: {
            type: "string",
            description: "The channel ID to own the canvas.",
          },
          user_id: {
            type: "string",
            description: "The user ID to own the canvas.",
          },
        },
        description: "Details for canvas ownership.",
      },
    },
    required: ["title"],
  },
};

const canvasesAccessSetTool: Tool = {
  name: "slack_canvases_access_set",
  description: "Set the access level for users or channels to a canvas.",
  inputSchema: {
    type: "object",
    properties: {
      canvas_id: {
        type: "string",
        description: "The ID of the canvas to set access for.",
      },
      access_level: {
        type: "string",
        enum: ["read", "write"],
        description: "The access level to grant.",
      },
      channel_ids: {
        type: "array",
        items: {
          type: "string",
        },
        description: "A list of channel IDs to grant access to.",
      },
      user_ids: {
        type: "array",
        items: {
          type: "string",
        },
        description: "A list of user IDs to grant access to.",
      },
    },
    required: ["canvas_id", "access_level"],
  },
};

const postMessageTool: Tool = {
  name: "slack_post_message",
  description: "Post a new message to a Slack channel",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel to post to",
      },
      text: {
        type: "string",
        description: "The message text to post",
      },
    },
    required: ["channel_id", "text"],
  },
};

const replyToThreadTool: Tool = {
  name: "slack_reply_to_thread",
  description: "Reply to a specific message thread in Slack",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel containing the thread",
      },
      thread_ts: {
        type: "string",
        description: "The timestamp of the parent message in the format '1234567890.123456'. Timestamps in the format without the period can be converted by adding the period such that 6 numbers come after it.",
      },
      text: {
        type: "string",
        description: "The reply text",
      },
    },
    required: ["channel_id", "thread_ts", "text"],
  },
};

const addReactionTool: Tool = {
  name: "slack_add_reaction",
  description: "Add a reaction emoji to a message",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel containing the message",
      },
      timestamp: {
        type: "string",
        description: "The timestamp of the message to react to",
      },
      reaction: {
        type: "string",
        description: "The name of the emoji reaction (without ::)",
      },
    },
    required: ["channel_id", "timestamp", "reaction"],
  },
};

const getChannelHistoryTool: Tool = {
  name: "slack_get_channel_history",
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
        description: "Number of messages to retrieve (default 10)",
        default: 10,
      },
    },
    required: ["channel_id"],
  },
};

const getThreadRepliesTool: Tool = {
  name: "slack_get_thread_replies",
  description: "Get all replies in a message thread",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel containing the thread",
      },
      thread_ts: {
        type: "string",
        description: "The timestamp of the parent message in the format '1234567890.123456'. Timestamps in the format without the period can be converted by adding the period such that 6 numbers come after it.",
      },
    },
    required: ["channel_id", "thread_ts"],
  },
};

const getUsersTool: Tool = {
  name: "slack_get_users",
  description:
    "Get a list of all users in the workspace with their basic profile information",
  inputSchema: {
    type: "object",
    properties: {
      cursor: {
        type: "string",
        description: "Pagination cursor for next page of results",
      },
      limit: {
        type: "number",
        description: "Maximum number of users to return (default 100, max 200)",
        default: 100,
      },
    },
  },
};

const getUserProfileTool: Tool = {
  name: "slack_get_user_profile",
  description: "Get detailed profile information for a specific user",
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

const canvasesAccessDeleteTool: Tool = {
  name: "slack_canvases_access_delete",
  description: "Revoke access to a canvas for users or channels.",
  inputSchema: {
    type: "object",
    properties: {
      canvas_id: {
        type: "string",
        description: "The ID of the canvas to revoke access to.",
      },
      channel_ids: {
        type: "array",
        items: {
          type: "string",
        },
        description: "A list of channel IDs to revoke access for.",
      },
      user_ids: {
        type: "array",
        items: {
          type: "string",
        },
        description: "A list of user IDs to revoke access for.",
      },
    },
    required: ["canvas_id"],
  },
};

class SlackClient {
  private botHeaders: { Authorization: string; "Content-Type": string };

  constructor(botToken: string) {
    this.botHeaders = {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    };
  }

  async getChannels(limit: number = 100, cursor?: string): Promise<any> {
    const predefinedChannelIds = process.env.SLACK_CHANNEL_IDS;
    if (!predefinedChannelIds) {
      const params = new URLSearchParams({
        types: "public_channel",
        exclude_archived: "true",
        limit: Math.min(limit, 200).toString(),
        team_id: process.env.SLACK_TEAM_ID!,
      });
  
      if (cursor) {
        params.append("cursor", cursor);
      }
  
      const response = await fetch(
        `https://slack.com/api/conversations.list?${params}`,
        { headers: this.botHeaders },
      );
  
      return response.json();
    }

    const predefinedChannelIdsArray = predefinedChannelIds.split(",").map((id: string) => id.trim());
    const channels = [];

    for (const channelId of predefinedChannelIdsArray) {
      const params = new URLSearchParams({
        channel: channelId,
      });

      const response = await fetch(
        `https://slack.com/api/conversations.info?${params}`,
        { headers: this.botHeaders }
      );
      const data = await response.json();

      if (data.ok && data.channel && !data.channel.is_archived) {
        channels.push(data.channel);
      }
    }

    return {
      ok: true,
      channels: channels,
      response_metadata: { next_cursor: "" },
    };
  }

  async postMessage(channel_id: string, text: string): Promise<any> {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        text: text,
      }),
    });

    return response.json();
  }

  async postReply(
    channel_id: string,
    thread_ts: string,
    text: string,
  ): Promise<any> {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        thread_ts: thread_ts,
        text: text,
      }),
    });

    return response.json();
  }

  async addReaction(
    channel_id: string,
    timestamp: string,
    reaction: string,
  ): Promise<any> {
    const response = await fetch("https://slack.com/api/reactions.add", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        timestamp: timestamp,
        name: reaction,
      }),
    });

    return response.json();
  }

  async getChannelHistory(
    channel_id: string,
    limit: number = 10,
  ): Promise<any> {
    const params = new URLSearchParams({
      channel: channel_id,
      limit: limit.toString(),
    });

    const response = await fetch(
      `https://slack.com/api/conversations.history?${params}`,
      { headers: this.botHeaders },
    );

    return response.json();
  }

  async getThreadReplies(channel_id: string, thread_ts: string): Promise<any> {
    const params = new URLSearchParams({
      channel: channel_id,
      ts: thread_ts,
    });

    const response = await fetch(
      `https://slack.com/api/conversations.replies?${params}`,
      { headers: this.botHeaders },
    );

    return response.json();
  }

  async getUsers(limit: number = 100, cursor?: string): Promise<any> {
    const params = new URLSearchParams({
      limit: Math.min(limit, 200).toString(),
      team_id: process.env.SLACK_TEAM_ID!,
    });

    if (cursor) {
      params.append("cursor", cursor);
    }

    const response = await fetch(`https://slack.com/api/users.list?${params}`, {
      headers: this.botHeaders,
    });

    return response.json();
  }

  async getUserProfile(user_id: string): Promise<any> {
    const params = new URLSearchParams({
      user: user_id,
      include_labels: "true",
    });

    const response = await fetch(
      `https://slack.com/api/users.profile.get?${params}`,
      { headers: this.botHeaders },
    );

    return response.json();
  }

  async canvasesAccessDelete(args: CanvasesAccessDeleteArgs): Promise<any> {
    const response = await fetch("https://slack.com/api/canvases.access.delete", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify(args),
    });
    return response.json();
  }

  async conversationsCanvasesCreate(args: ConversationsCanvasesCreateArgs): Promise<CanvasesCreateResponse> {
    const response = await fetch("https://slack.com/api/conversations.canvases.create", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify(args),
    });
    return response.json();
  }

  async canvasesSectionsLookup(args: CanvasesSectionsLookupArgs): Promise<CanvasesSectionsLookupResponse> {
    const response = await fetch("https://slack.com/api/canvases.sections.lookup", {
      method: "POST", // Slack API docs say GET, but it's likely POST for a body with criteria
      headers: this.botHeaders,
      body: JSON.stringify(args),
    });
    return response.json();
  }

  async canvasesEdit(args: CanvasesEditArgs): Promise<any> {
    const response = await fetch("https://slack.com/api/canvases.edit", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify(args),
    });
    return response.json();
  }

  async canvasesDelete(args: CanvasesDeleteArgs): Promise<any> {
    const response = await fetch("https://slack.com/api/canvases.delete", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify(args),
    });
    return response.json();
  }

  async canvasesCreate(args: CanvasesCreateArgs): Promise<CanvasesCreateResponse> {
    const response = await fetch("https://slack.com/api/canvases.create", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify(args),
    });
    return response.json();
  }

  async canvasesAccessSet(args: CanvasesAccessSetArgs): Promise<any> {
    const response = await fetch("https://slack.com/api/canvases.access.set", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify(args),
    });
    return response.json();
  }
}

async function main() {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const teamId = process.env.SLACK_TEAM_ID;

  if (!botToken || !teamId) {
    console.error(
      "Please set SLACK_BOT_TOKEN and SLACK_TEAM_ID environment variables",
    );
    process.exit(1);
  }

  console.error("Starting Slack MCP Server...");
  const server = new Server(
    {
      name: "Slack MCP Server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const slackClient = new SlackClient(botToken);

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      console.error("Received CallToolRequest:", request);
      try {
        if (!request.params.arguments) {
          throw new Error("No arguments provided");
        }

        switch (request.params.name) {
          case "slack_list_channels": {
            const args = request.params
              .arguments as unknown as ListChannelsArgs;
            const response = await slackClient.getChannels(
              args.limit,
              args.cursor,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_post_message": {
            const args = request.params.arguments as unknown as PostMessageArgs;
            if (!args.channel_id || !args.text) {
              throw new Error(
                "Missing required arguments: channel_id and text",
              );
            }
            const response = await slackClient.postMessage(
              args.channel_id,
              args.text,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_reply_to_thread": {
            const args = request.params
              .arguments as unknown as ReplyToThreadArgs;
            if (!args.channel_id || !args.thread_ts || !args.text) {
              throw new Error(
                "Missing required arguments: channel_id, thread_ts, and text",
              );
            }
            const response = await slackClient.postReply(
              args.channel_id,
              args.thread_ts,
              args.text,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_add_reaction": {
            const args = request.params.arguments as unknown as AddReactionArgs;
            if (!args.channel_id || !args.timestamp || !args.reaction) {
              throw new Error(
                "Missing required arguments: channel_id, timestamp, and reaction",
              );
            }
            const response = await slackClient.addReaction(
              args.channel_id,
              args.timestamp,
              args.reaction,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_get_channel_history": {
            const args = request.params
              .arguments as unknown as GetChannelHistoryArgs;
            if (!args.channel_id) {
              throw new Error("Missing required argument: channel_id");
            }
            const response = await slackClient.getChannelHistory(
              args.channel_id,
              args.limit,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_get_thread_replies": {
            const args = request.params
              .arguments as unknown as GetThreadRepliesArgs;
            if (!args.channel_id || !args.thread_ts) {
              throw new Error(
                "Missing required arguments: channel_id and thread_ts",
              );
            }
            const response = await slackClient.getThreadReplies(
              args.channel_id,
              args.thread_ts,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_get_users": {
            const args = request.params.arguments as unknown as GetUsersArgs;
            const response = await slackClient.getUsers(
              args.limit,
              args.cursor,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_get_user_profile": {
            const args = request.params
              .arguments as unknown as GetUserProfileArgs;
            if (!args.user_id) {
              throw new Error("Missing required argument: user_id");
            }
            const response = await slackClient.getUserProfile(args.user_id);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_canvases_access_delete": {
            const args = request.params.arguments as unknown as CanvasesAccessDeleteArgs;
            if (!args.canvas_id) {
              throw new Error("Missing required argument: canvas_id");
            }
            const response = await slackClient.canvasesAccessDelete(args);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_canvases_access_set": {
            const args = request.params.arguments as unknown as CanvasesAccessSetArgs;
            if (!args.canvas_id || !args.access_level) {
              throw new Error("Missing required arguments: canvas_id and access_level");
            }
            const response = await slackClient.canvasesAccessSet(args);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_canvases_create": {
            const args = request.params.arguments as unknown as CanvasesCreateArgs;
            if (!args.title) {
              throw new Error("Missing required argument: title");
            }
            const response = await slackClient.canvasesCreate(args);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_canvases_delete": {
            const args = request.params.arguments as unknown as CanvasesDeleteArgs;
            if (!args.canvas_id) {
              throw new Error("Missing required argument: canvas_id");
            }
            const response = await slackClient.canvasesDelete(args);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_canvases_edit": {
            const args = request.params.arguments as unknown as CanvasesEditArgs;
            if (!args.canvas_id || !args.changes) {
              throw new Error("Missing required arguments: canvas_id and changes");
            }
            const response = await slackClient.canvasesEdit(args);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_canvases_sections_lookup": {
            const args = request.params.arguments as unknown as CanvasesSectionsLookupArgs;
            if (!args.canvas_id || !args.criteria) {
              throw new Error("Missing required arguments: canvas_id and criteria");
            }
            const response = await slackClient.canvasesSectionsLookup(args);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          }

          case "slack_conversations_canvases_create": {
            const args = request.params.arguments as unknown as ConversationsCanvasesCreateArgs;
            if (!args.channel_id) {
              throw new Error("Missing required argument: channel_id");
            }
            const response = await slackClient.conversationsCanvasesCreate(args);
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
        postMessageTool,
        replyToThreadTool,
        addReactionTool,
        getChannelHistoryTool,
        getThreadRepliesTool,
        getUsersTool,
        getUserProfileTool,
        canvasesAccessDeleteTool,
        canvasesAccessSetTool,
        canvasesCreateTool,
        canvasesDeleteTool,
        canvasesEditTool,
        canvasesSectionsLookupTool,
        conversationsCanvasesCreateTool,
      ],
    };
  });

  const transport = new StdioServerTransport();
  console.error("Connecting server to transport...");
  await server.connect(transport);

  console.error("Slack MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
