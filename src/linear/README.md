# Linear MCP Server

A [Model Context Protocol](https://github.com/modelcontextprotocol) server for the [Linear API](https://developers.linear.app/docs/graphql/working-with-the-graphql-api).

This server provides integration with Linear's issue tracking system through MCP, allowing LLMs to interact with Linear issues.

## Installation

1. Create or get a Linear API key for your team: https://linear.app/YOUR-TEAM/settings/api

2. Add server config to Claude Desktop:
   - MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-linear"
      ],
      "env": {
        "LINEAR_API_KEY": "your_linear_api_key_here"
      }
    }
  }
}
```

## Components

### Tools

1. **`create_issue`**: Create a new Linear issues
   - Required inputs:
     - `title` (string): Issue title
     - `teamId` (string): Team ID to create issue in
   - Optional inputs:
     - `description` (string): Issue description (markdown supported)
     - `priority` (number, 0-4): Priority level (1=urgent, 4=low)
     - `status` (string): Initial status name

2. **`update_issue`**: Update existing issues
   - Required inputs:
     - `id` (string): Issue ID to update
   - Optional inputs:
     - `title` (string): New title
     - `description` (string): New description
     - `priority` (number, 0-4): New priority
     - `status` (string): New status name

3. **`search_issues`**: Search issues with flexible filtering
   - Optional inputs:
     - `query` (string): Text to search in title/description
     - `teamId` (string): Filter by team
     - `status` (string): Filter by status
     - `assigneeId` (string): Filter by assignee
     - `labels` (string[]): Filter by labels
     - `priority` (number): Filter by priority
     - `limit` (number, default: 10): Max results

4. **`get_user_issues`**: Get issues assigned to a user
   - Optional inputs:
     - `userId` (string): User ID (omit for authenticated user)
     - `includeArchived` (boolean): Include archived issues
     - `limit` (number, default: 50): Max results

5. **`add_comment`**: Add comments to issues
   - Required inputs:
     - `issueId` (string): Issue ID to comment on
     - `body` (string): Comment text (markdown supported)
   - Optional inputs:
     - `createAsUser` (string): Custom username
     - `displayIconUrl` (string): Custom avatar URL

### Resources

- `linear-issue:///{issueId}` - View individual issue details
- `linear-team:///{teamId}/issues` - View team issues
- `linear-user:///{userId}/assigned` - View user's assigned issues
- `linear-organization:` - View organization info
- `linear-viewer:` - View current user context

## Usage examples

Some example prompts you can use with Claude Desktop to interact with Linear:

1. "Show me all my high-priority issues" → execute the `search_issues` tool and/or `linear-user:///{userId}/assigned` to find issues assigned to you with priority 1

2. "Based on what I've told you about this bug already, make a bug report for the authentication system" → use `create_issue` to create a new high-priority issue with appropriate details and status tracking

3. "Find all in progress frontend tasks" → use `search_issues` to locate frontend-related issues with in progress task

4. "Give me a summary of recent updates on the issues for mobile app development" → use `search_issues` to identify the relevant issue(s), then `linear-issue:///{issueId}` fetch the issue details and show recent activity and comments

5. "What's the current workload for the mobile team?" → combine `linear-team:///{teamId}/issues` and `search_issues` to analyze issue distribution and priorities across the mobile team

## Development

1. Install dependencies:
```bash
npm install
```

2. Configure Linear API key in `.env`:
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

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.