# Slack MCP Server

MCP Server for the Slack API, enabling Claude to interact with Slack workspaces.

## Tools

1. `slack_list_channels`
   - List public or pre-defined channels in the workspace
   - Optional inputs:
     - `limit` (number, default: 100, max: 200): Maximum number of channels to return
     - `cursor` (string): Pagination cursor for next page
   - Returns: List of channels with their IDs and information

2. `slack_post_message`
   - Post a new message to a Slack channel
   - Required inputs:
     - `channel_id` (string): The ID of the channel to post to
     - `text` (string): The message text to post
   - Returns: Message posting confirmation and timestamp

3. `slack_reply_to_thread`
   - Reply to a specific message thread
   - Required inputs:
     - `channel_id` (string): The channel containing the thread
     - `thread_ts` (string): Timestamp of the parent message
     - `text` (string): The reply text
   - Returns: Reply confirmation and timestamp

4. `slack_add_reaction`
   - Add an emoji reaction to a message
   - Required inputs:
     - `channel_id` (string): The channel containing the message
     - `timestamp` (string): Message timestamp to react to
     - `reaction` (string): Emoji name without colons
   - Returns: Reaction confirmation

5. `slack_get_channel_history`
   - Get recent messages from a channel
   - Required inputs:
     - `channel_id` (string): The channel ID
   - Optional inputs:
     - `limit` (number, default: 10): Number of messages to retrieve
   - Returns: List of messages with their content and metadata

6. `slack_get_thread_replies`
   - Get all replies in a message thread
   - Required inputs:
     - `channel_id` (string): The channel containing the thread
     - `thread_ts` (string): Timestamp of the parent message
   - Returns: List of replies with their content and metadata


7. `slack_get_users`
   - Get list of workspace users with basic profile information
   - Optional inputs:
     - `cursor` (string): Pagination cursor for next page
     - `limit` (number, default: 100, max: 200): Maximum users to return
   - Returns: List of users with their basic profiles

8. `slack_get_user_profile`
   - Get detailed profile information for a specific user
   - Required inputs:
     - `user_id` (string): The user's ID
   - Returns: Detailed user profile information

## Setup

1. Create a Slack App:
   - Visit the [Slack Apps page](https://api.slack.com/apps)
   - Click "Create New App"
   - Choose "From scratch"
   - Name your app and select your workspace

2. Configure Bot Token Scopes:
   Navigate to "OAuth & Permissions" and add these scopes:
   - `channels:history` - View messages and other content in public channels
   - `channels:read` - View basic channel information
   - `chat:write` - Send messages as the app
   - `reactions:write` - Add emoji reactions to messages
   - `users:read` - View users and their basic information
   - `users.profile:read` - View detailed profiles about users

4. Install App to Workspace:
   - Click "Install to Workspace" and authorize the app
   - Save the "Bot User OAuth Token" that starts with `xoxb-`

5. Get your Team ID (starts with a `T`) by following [this guidance](https://slack.com/help/articles/221769328-Locate-your-Slack-URL-or-ID#find-your-workspace-or-org-id)

### Usage with Claude Desktop

Add the following to your `claude_desktop_config.json`:

#### npx

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-slack"
      ],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-bot-token",
        "SLACK_TEAM_ID": "T01234567",
        "SLACK_CHANNEL_IDS": "C01234567, C76543210"
      }
    }
  }
}
```

#### docker

```json
{
  "mcpServers": {
    "slack": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "SLACK_BOT_TOKEN",
        "-e",
        "SLACK_TEAM_ID",
        "-e",
        "SLACK_CHANNEL_IDS",
        "mcp/slack"
      ],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-bot-token",
        "SLACK_TEAM_ID": "T01234567",
        "SLACK_CHANNEL_IDS": "C01234567, C76543210"
      }
    }
  }
}
```

### Environment Variables

1. `SLACK_BOT_TOKEN`: Required. The Bot User OAuth Token starting with `xoxb-`.
2. `SLACK_TEAM_ID`: Required. Your Slack workspace ID starting with `T`.
3. `SLACK_CHANNEL_IDS`: Optional. Comma-separated list of channel IDs to limit channel access (e.g., "C01234567, C76543210"). If not set, all public channels will be listed.

### Troubleshooting

If you encounter permission errors, verify that:
1. All required scopes are added to your Slack app
2. The app is properly installed to your workspace
3. The tokens and workspace ID are correctly copied to your configuration
4. The app has been added to the channels it needs to access

## Build

Docker build:

```bash
docker build -t mcp/slack -f src/slack/Dockerfile .
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
