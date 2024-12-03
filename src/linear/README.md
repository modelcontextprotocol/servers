# Linear MCP Server

A [Model Context Protocol](https://github.com/modelcontextprotocol) server for the [Linear API](https://developers.linear.app/docs/graphql/working-with-the-graphql-api).

This server provides integration with Linear's issue tracking system through MCP, allowing LLMs to interact with Linear issues.

## Features

### Tools

- `create_issue` - Create new issues with title, description, priority, and team
- `update_issue` - Update existing issues (title, description, priority, status)
- `search_issues` - Search issues with flexible filtering:
  - Text search in title/description
  - Filter by team, status, assignee
  - Filter by labels, priority, estimate
  - Include/exclude archived issues
- `get_user_issues` - Get issues assigned to a specific user
- `add_comment` - Add comments to issues (supports markdown)

### Resources

- `linear-issue:///{issueId}` - View individual issue details with metadata
- `linear-team:///{teamId}/issues` - View all issues for a specific team
- `linear-user:///{userId}/assigned` - Access issues assigned to a user
- `linear-organization:` - Get organization and team information
- `linear-viewer:` - View current user context and permissions

## Installation

First, create or get a Linear API key for your team here: https://linear.app/YOUR-TEAM/settings/api

To use with Claude Desktop, add this server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
    "mcpServers": {
        "linear": {
            "command": "node",
            "args": [
                "/path/to/linear-mcp-server/build/index.js"
            ],
            "env": {
                "LINEAR_API_KEY": "your_linear_api_key_here"
            }
        }
    }
}
```

## Dev Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Linear API key in a `.env`:
```
LINEAR_API_KEY=your_api_key_here
```

3. Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```