# Raygun MCP Server

MCP Server for Raygun's API V3 endpoints for interacting with your Crash Reporting and Real User Monitoring applications. This server provides comprehensive access to Raygun's API features through the Model Context Protocol.

## Features

### Tools

#### Applications
- `list_applications` - List all applications under your account
- `get_application` - Get application details by identifier
- `get_application_by_api_key` - Get application details by API key
- `regenerate_application_api_key` - Generate a new API key for an application

#### Error Management
- `list_error_groups` - List error groups for an application
- `get_error_group` - Get detailed information about an error group
- `resolve_error_group` - Set error group status to resolved
- `activate_error_group` - Set error group status to active
- `ignore_error_group` - Set error group status to ignored
- `permanently_ignore_error_group` - Set error group status to permanently ignored

#### Deployment Management
- `list_deployments` - List deployments for an application
- `get_deployment` - Get deployment details by identifier
- `delete_deployment` - Remove a deployment
- `update_deployment` - Update deployment information
- `reprocess_deployment_commits` - Reprocess deployment commit data

#### User & Session Management
- `list_customers` - List customers for an application
- `list_sessions` - List user sessions for an application
- `get_session` - Get detailed session information

#### Performance Monitoring
- `list_pages` - List monitored pages for an application
- `get_page_metrics_time_series` - Get time-series performance metrics
- `get_page_metrics_histogram` - Get histogram of performance metrics
- `get_error_metrics_time_series` - Get time-series error metrics

#### Source Maps
- `list_source_maps` - List source maps for an application
- `get_source_map` - Get source map details
- `update_source_map` - Update source map information
- `delete_source_map` - Remove a source map
- `upload_source_map` - Upload a new source map
- `delete_all_source_maps` - Remove all source maps

#### Team Management
- `list_invitations` - List pending team invitations
- `send_invitation` - Send a new team invitation
- `get_invitation` - Get invitation details
- `revoke_invitation` - Revoke a pending invitation

## Configuration

The server requires the following environment variables:

- `RAYGUN_API_KEY` (required): Your Raygun API key
- `SOURCEMAP_ALLOWED_DIRS` (optional): Comma-separated list of directories allowed for source map operations

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "raygun": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-raygun"],
      "env": {
        "RAYGUN_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

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
{
  "mcpServers": {
    "raygun-server": {
      "command": "/path/to/server-raygun/build/index.js",
      "env": {
        "RAYGUN_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.
