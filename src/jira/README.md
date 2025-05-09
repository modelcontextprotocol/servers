# Jira MCP Server

This is a Machine Control Protocol (MCP) server for interacting with Jira's API.

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- A Jira account with API access

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure Codeium MCP:
   - Add the following configuration to your Codeium MCP config file (`~/.codeium/windsurf/mcp_config.json`):

   ```json
   {
     "mcpServers": {
       "jira": {
         "command": "npx",
         "args": [
           "-y",
           "tsx",
           "/path/to/jira_mcp/main.ts"
         ],
         "env": {
           "JIRA_USERNAME": "your_username",
           "JIRA_API_KEY": "your_api_key",
           "JIRA_BASE_URL": "your_jira_instance_url"
         }
       }
     }
   }
   ```

## Usage

The MCP server will be automatically started by Codeium when needed. Available commands:

- `get_issue`: Retrieve information about a specific Jira issue by key (e.g., "RMPRE-123")

## Development

To run the server locally for development:

```bash
npm start
