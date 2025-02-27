# Email MCP Server

An MCP server implementation that integrates with Gmail, allowing LLMs to fetch recent emails via the Gmail API.

## Features

- **Fetch Emails**: Retrieve a list of recent emails with subject, snippet, and message ID.
- Tool-based integration with Claude Desktop via MCP.

## Tools

- **fetch_emails**
  - Fetches recent emails from Gmail.
  - Inputs:
    - `count` (number, optional): Number of emails to fetch (default: 10, max: 50).

## Prerequisites

- Node.js 16+ (for local development).
- A Google Cloud project with Gmail API enabled.
- OAuth 2.0 credentials (`credentials.json`) from Google Cloud Console.

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/modelcontextprotocol/servers.git
   cd servers/community/mcp-email-server
   ```

2. Install dependencies:

```bash
npm install
```

3. Place your `credentials.json` file in the project root (obtained from Google Cloud Console).
4. Build and Start the project:

```bash
npm run build
npm start
```

- Follow the authorization URL, enter the code, and copy the export GOOGLE_OAUTH_TOKEN='...' command from the output.
- Add it to your environment:

```bash
export GOOGLE_OAUTH_TOKEN='your_token_here'
```

5. On first run, authorize the app via the provided URL and enter the code.

# Configuration

## Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

### Docker

```json
{
  "mcpServers": {
    "email": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "./credentials.json:/app/credentials.json",
        "mcp/email-server"
      ],
      "env": {
        "GOOGLE_OAUTH_TOKEN": "your_token_here"
      }
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "email": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-email"],
      "env": {
        "GOOGLE_OAUTH_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Sample Usage

```typescript
const result = await client.callTool({
  name: "fetch_emails",
  arguments: {
    count: 5,
  },
});
```

### Response Format

```bash
Subject: Meeting Tomorrow
Snippet: Hi, just a reminder for our meeting at 10 AM...
ID: 18d5f6a7b2c3d4e5

Subject: Project Update
Snippet: Here’s the latest on the project timeline...
ID: 18d5f6a7b2c3d4e6
```

## Building with Docker

```bash
docker build -t mcp/email-server -f Dockerfile .
```

### Running with Docker

```bash
docker run -i --rm -v $(pwd)/credentials.json:/app/credentials.json -v $(pwd)/token.json:/app/token.json mcp/email-server
```

- Ensure credentials.json and token.json are in your current directory.

## Notes

- Currently read-only. Future updates could add email drafting support.
- Token generation requires initial manual interaction (not fully automated in Docker yet).

# License

This MCP server is licensed under the MIT License This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the `LICENSE` file in the project repository.
