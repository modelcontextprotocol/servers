# Discord MCP Server

MCP Server for the Discord API, enabling Claude to interact with Discord servers.

## Tools

1. `discord_list_channels`

   - List channels in a Discord guild (server).
   - Required Inputs:
     - `guild_id` (string): The ID of the guild (server).
   - Returns: List of channels with their IDs and information.

2. `discord_send_message`

   - Send a message to a Discord channel.
   - Required Inputs:
     - `channel_id` (string): The ID of the channel to send to.
     - `content` (string): The message content.
   - Returns: Message sending confirmation and message ID.

3. `discord_reply_to_message`

   - Description: Reply to a specific message in Discord.
   - Required Inputs:
     - `channel_id` (string): The channel containing the message.
     - `message_id` (string): The ID of the message to reply to.
     - `content` (string): The reply content.
   - Returns: Reply confirmation and message ID.

4. `discord_add_reaction`

   - Description: Add an emoji reaction to a message.
   - Required Inputs:
     - `channel_id` (string): The channel containing the message.
     - `message_id` (string): The ID of the message to react to.
     - `emoji` (string): The emoji to react with (URL-encoded if necessary).
   - Returns: Reaction confirmation.

5. `discord_get_channel_messages`

   - Description: Get recent messages from a channel.
   - Required Inputs:
     - `channel_id` (string): The channel ID.
   - Optional Inputs:
     - `limit` (number, default: 50, max: 100): Number of messages to retrieve.
   - Returns: List of messages with their content and metadata.

6. `discord_get_guild_members`

   - Description: Get a list of members in a guild.
   - Required Inputs:
     - `guild_id` (string): The guild ID.
   - Optional Inputs:
     - `limit` (number, default: 50, max: 1000): Maximum number of members to return.
     - `after` (string): The highest user ID in the previous page.
   - Returns: List of guild members with their information.

7. `discord_get_user_profile`
   - Description: Get user information for a specific user.
   - Required Inputs:
     - `user_id` (string): The user's ID.
   - Returns: User profile information.

## Setup

1. Create a Discord Bot:

   - Visit the [Discord Developer Portal](https://discord.com/developers/applications).
   - Click "New Application".
   - Name your application and click "Create".
   - Navigate to the "Bot" section on the left menu.
   - Click "Add Bot" and confirm by clicking "Yes, do it!".

2. Configure Bot Permissions:

   - Under Privileged Gateway Intents, enable:
     - Server Members Intent (if you need to access member data).
     - Message Content Intent (if you need to read message content).
   - Under Bot Permissions, ensure the following permissions are selected:
     - Send Messages
     - Read Message History
     - Add Reactions
     - Manage Messages
     - View Channels
     - Other permissions as required by your tools.
   - Copy the Bot Token by clicking "Reset Token" and confirming. Save this token securely; it starts with something like `MTAx...`.

3. Invite the Bot to Your Server:

   - Go to the "OAuth2" section, then "URL Generator".
   - Under Scopes, select "bot".
   - Under Bot Permissions, select the permissions that match what you configured earlier.
   - Copy the generated URL and open it in your browser.
   - Select the server you want to add the bot to and authorize it.

4. Get Your Guild ID:
   - Enable Developer Mode in Discord:
     - Go to User Settings > Advanced > Developer Mode.
   - Right-click on your server (guild) in Discord and select "Copy ID".
   - Save this Guild ID for later use.

### Usage with Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-discord"],
      "env": {
        "DISCORD_BOT_TOKEN": "your-bot-token",
        "DISCORD_GUILD_ID": "your-guild-id"
      }
    }
  }
}
```

### Troubleshooting

If you encounter permission errors, verify that:

1. All required permissions are added to your Discord bot.
2. The bot is properly added to your server.
3. The bot token and guild ID are correctly copied to your configuration.
4. The bot has the appropriate permissions in your server settings.
5. Privileged Gateway Intents are enabled if you need to access member data or message content.

## License

This MCP server is licensed under the **MIT License**. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the **LICENSE** file in the project repository.
