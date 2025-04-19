# MCP Servers Module

This module provides management for Model Context Protocol (MCP) servers in the NestJS Codex system. It allows you to start, stop, and monitor various MCP server types.

## Features

- List available MCP server types
- Start new MCP server instances
- Stop running MCP servers
- Get details about running servers
- Install dependencies for server types

## Available Server Types

The module provides access to multiple MCP server types, including:

- `fetch` - HTTP fetching and content processing
- `filesystem` - File system operations for MCP
- `gdrive` - Google Drive integration
- `github` - GitHub API integration
- `gitlab` - GitLab API integration
- `google-maps` - Google Maps integration
- `memory` - In-memory context storage
- `postgres` - PostgreSQL database integration
- `redis` - Redis integration
- `slack` - Slack integration
- `sqlite` - SQLite database integration
- `time` - Time-related utilities

## API Endpoints

- `GET /mcp-servers/types` - List all available server types
- `GET /mcp-servers/types/:type` - Get details for a specific server type
- `POST /mcp-servers/start` - Start a new server instance
- `DELETE /mcp-servers/:id` - Stop a running server
- `GET /mcp-servers` - List all running servers
- `GET /mcp-servers/:id` - Get details for a specific server
- `POST /mcp-servers/types/:type/install` - Install dependencies for a server type

## Usage

```typescript
// Example using the service
import { McpServersService } from './mcp-servers.service';

@Injectable()
export class YourService {
  constructor(private readonly mcpServersService: McpServersService) {}

  async someMethod() {
    // Start a fetch server
    const server = await this.mcpServersService.startServer(
      'fetch',
      'my-fetch-server',
      { API_KEY: 'your-api-key' }
    );
    
    // Use the server ID for further operations
    const serverId = server.id;
    
    // Later, stop the server
    await this.mcpServersService.stopServer(serverId);
  }
}
```

## Server Process Management

The module handles server processes using Node.js child process management, with:

- Graceful termination (SIGTERM with fallback to SIGKILL)
- Process monitoring and status tracking
- Error handling and reporting
- Environment variable configuration

## Server Development

To add a new MCP server type:

1. Create a new directory in `src/modules/mcp-servers/src/your-server-name`
2. Implement the MCP protocol using the MCP SDK
3. Provide a `package.json` with appropriate dependencies and start script
4. Register your server with the system

See the existing server implementations for examples of how to structure new server types.