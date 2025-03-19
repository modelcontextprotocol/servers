#!/usr/bin/env node
import http from "http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  type Tool,
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

// Tool definitions
const listChannelsTool: Tool = {
  name: "slack_list_channels",
  description: "List public channels in the workspace with pagination",
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

class SlackClient {
  private botHeaders: { Authorization: string; "Content-Type": string };

  constructor(botToken: string) {
    this.botHeaders = {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    };
  }

  async getChannels(limit: number = 100, cursor?: string): Promise<any> {
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

  console.error("Starting Slack MCP HTTP Server...");

  const slackClient = new SlackClient(botToken);
  const server = new Server(
    { name: "Slack MCP HTTP Server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  
  const requestHandler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const requestData = JSON.parse(body);

        if (requestData.type === "ListToolsRequest") {
          console.error("Received ListToolsRequest");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ tools: [listChannelsTool, postMessageTool, replyToThreadTool, addReactionTool, getChannelHistoryTool, getThreadRepliesTool, getUsersTool, getUserProfileTool] }));
        } else if (requestData.type === "CallToolRequest") {
          console.error("Received CallToolRequest:", requestData);

          if (!requestData.params || !requestData.params.name) {
            throw new Error("Invalid request: Missing tool name");
          }

          let responseContent;
          switch (requestData.params.name) {
            case "slack_list_channels":
              const listArgs = requestData.params.arguments as ListChannelsArgs;
              responseContent = await slackClient.getChannels(listArgs.limit, listArgs.cursor);
              break;

            case "slack_post_message":
              const postArgs = requestData.params.arguments as PostMessageArgs;
              if (!postArgs.channel_id || !postArgs.text) {
                throw new Error("Missing required arguments: channel_id or text");
              }
              responseContent = await slackClient.postMessage(postArgs.channel_id, postArgs.text);
              break;

            case "slack_reply_to_thread":
              const threadArgs = requestData.params.arguments as ReplyToThreadArgs;
              if (!threadArgs.channel_id || !threadArgs.thread_ts || !threadArgs.text) {
                throw new Error("Missing required arguments: channel_id or thread timestamp or text")
              }
              responseContent = await slackClient.postReply(threadArgs.channel_id, threadArgs.thread_ts, threadArgs.text)
              break;

            case "slack_get_channel_history":
              const historyArgs = requestData.params.arguments as GetChannelHistoryArgs;
              if (!historyArgs.channel_id) {
                throw new Error("Missing required arguments: channel_id");
              }
              responseContent = await slackClient.getChannelHistory(historyArgs.channel_id, historyArgs.limit);
              break;
            
            case "slack_add_reaction":
              const reactionArgs = requestData.params.arguments as AddReactionArgs;
              if (!reactionArgs.channel_id || !reactionArgs.timestamp || !reactionArgs.reaction) {
                throw new Error("Missing required arguments: channel_id or timestamp or reaction")
              }
              responseContent = await slackClient.addReaction(reactionArgs.channel_id, reactionArgs.timestamp, reactionArgs.reaction)
              break;
            
            case "slack_get_thread_replies":
              const threadRepliesArgs = requestData.params.arguments as GetThreadRepliesArgs;
              if (!threadRepliesArgs.channel_id || !threadRepliesArgs.thread_ts) {
                throw new Error("Missing required arguments: channel_id or timestamp")
              }
              responseContent = await slackClient.getThreadReplies(threadRepliesArgs.channel_id, threadRepliesArgs.thread_ts)
              break;

            case "slack_get_users":
              const userArgs = requestData.params.arguments as GetUsersArgs;
              responseContent = await slackClient.getUsers(userArgs.limit, userArgs.cursor)
              break;

            case "slack_get_user_profile":
              const profileArgs = requestData.params.arguments as GetUserProfileArgs;
              if (!profileArgs.user_id) {
                throw new Error("Missing required argument: user_id")
              }
              responseContent = await slackClient.getUserProfile(profileArgs.user_id)
              break;

            default:
              throw new Error(`Unknown tool: ${requestData.params.name}`);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(responseContent) }] }));
        } else {
          throw new Error("Invalid request type");
        }
      } catch (error) {
        console.error("Error handling request:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    });
  };

  const httpServer = http.createServer(requestHandler);
  const PORT = process.env.PORT || 3000;

  httpServer.listen(PORT, () => {
    console.error(`Slack MCP HTTP Server running on port ${PORT}`);
  });
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
