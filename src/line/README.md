# LINE MCP Server

MCP server for interacting with LINE Messaging API

This is a TypeScript-based MCP server that implements LINE bot functionality. It demonstrates core MCP concepts by providing:

- Tools for sending messages to LINE users
- Tools for retrieving LINE user profiles
- Integration with LINE Messaging API

## Features

### Tools
- `line_send_message` - Send messages to LINE users
  - Takes `user_id` and `message` as required parameters
  - Sends text messages via LINE Bot API
- `line_get_profile` - Get LINE user profile information
  - Takes `user_id` as required parameter
  - Retrieves user profile data from LINE Platform

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

## Installation

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`  
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
"line": {
  "command": "node",
  "args": [
    "path/to/your/build/index.js"
  ],
  "env": {
    "LINE_CHANNEL_ACCESS_TOKEN": "your_line_channel_access_token"
  }
}
```

### Prerequisites
- Node.js and npm installed
- LINE Channel Access Token (obtainable from [LINE Developers Console](https://developers.line.biz/console/))
- LINE Bot account set up in LINE Developers Console

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## API Reference

### line_send_message
Sends a text message to a specified LINE user.

Parameters:
- `user_id` (string): The LINE user ID of the recipient
- `message` (string): The text content to send

Returns:
- JSON response from LINE Messaging API confirming delivery status

### line_get_profile
Retrieves profile information for a specified LINE user.

Parameters:
- `user_id` (string): The LINE user ID to lookup

Returns:
- JSON response containing user profile information

## Security Notes
- Keep your LINE Channel Access Token secure
- Do not commit tokens to version control
- Use environment variables for token management in production
- Follow LINE's security best practices and usage guidelines

## Error Handling
The server includes robust error handling for:
- Invalid/missing parameters
- Authentication failures
- API rate limits
- Network connectivity issues
- Invalid user IDs