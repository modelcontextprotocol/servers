# Redis

A Model Context Protocol server that provides access to Redis databases. This server enables LLMs to interact with Redis key-value stores through a set of standardized tools.

## Prerequisites

1. Redis server must be installed and running
   - [Download Redis](https://redis.io/download)
   - For Windows users: Use [Windows Subsystem for Linux (WSL)](https://redis.io/docs/getting-started/installation/install-redis-on-windows/) or [Memurai](https://www.memurai.com/) (Redis-compatible Windows server)
   - Default port: 6379

## Common Issues & Solutions

### Connection Errors

**ECONNREFUSED**
  - **Cause**: Redis/Memurai server is not running or unreachable
  - **Solution**: 
    - Verify server is running:
      - Redis: `redis-cli ping` should return "PONG"
      - Memurai (Windows): `memurai-cli ping` should return "PONG"
    - Check service status:
      - Linux: `systemctl status redis`
      - macOS: `brew services list`
      - Windows: Check Memurai in Services (services.msc)
    - Ensure correct port (default 6379) is not blocked by firewall
    - Verify Redis URL format: `redis://hostname:port`
    - If `redis://localhost:6379` fails with ECONNREFUSED, try using the explicit IP: `redis://127.0.0.1:6379`

### Server Behavior

- The server implements exponential backoff with a maximum of 5 retries
- Initial retry delay: 1 second, maximum delay: 30 seconds
- Server will exit after max retries to prevent infinite reconnection loops

## Components

### Tools

- **set**
  - Set a Redis key-value pair with optional expiration
  - Input:
    - `key` (string): Redis key
    - `value` (string): Value to store
    - `expireSeconds` (number, optional): Expiration time in seconds

- **get**
  - Get value by key from Redis
  - Input: `key` (string): Redis key to retrieve

- **delete**
  - Delete one or more keys from Redis
  - Input: `key` (string | string[]): Key or array of keys to delete

- **list**
  - List Redis keys matching a pattern
  - Input: `pattern` (string, optional): Pattern to match keys (default: *)

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

* when running docker on macos, use host.docker.internal if the server is running on the host network (eg localhost)
* Redis URL can be specified as an argument, defaults to "redis://localhost:6379" (use "redis://127.0.0.1:6379" if localhost fails)

```json
{
  "mcpServers": {
    "redis": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm", 
        "mcp/redis", 
        "redis://host.docker.internal:6379"]
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "redis": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-redis",
        "redis://localhost:6379"
      ]
    }
  }
}
```

## Usage with VS Code

For quick installation, use one of the one-click install buttons below...

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=redis&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22redis_url%22%2C%22description%22%3A%22Redis%20URL%20(e.g.%20redis%3A%2F%2Flocalhost%3A6379)%22%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-redis%22%5D%2C%22env%22%3A%7B%22REDIS_URL%22%3A%22%24%7Binput%3Aredis_url%7D%22%7D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=redis&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22redis_url%22%2C%22description%22%3A%22Redis%20URL%20(e.g.%20redis%3A%2F%2Flocalhost%3A6379)%22%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-redis%22%5D%2C%22env%22%3A%7B%22REDIS_URL%22%3A%22%24%7Binput%3Aredis_url%7D%22%7D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=redis&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22redis_url%22%2C%22description%22%3A%22Redis%20URL%20(e.g.%20redis%3A%2F%2Fhost.docker.internal%3A6379)%22%7D%5D&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Fredis%22%5D%2C%22env%22%3A%7B%22REDIS_URL%22%3A%22%24%7Binput%3Aredis_url%7D%22%7D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=redis&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22redis_url%22%2C%22description%22%3A%22Redis%20URL%20(e.g.%20redis%3A%2F%2Fhost.docker.internal%3A6379)%22%7D%5D&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Fredis%22%5D%2C%22env%22%3A%7B%22REDIS_URL%22%3A%22%24%7Binput%3Aredis_url%7D%22%7D%7D&quality=insiders)

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open User Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> Note that the `mcp` key is not needed in the `.vscode/mcp.json` file.

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "redis_url",
        "description": "Redis URL (e.g. redis://localhost:6379)"
      }
    ],
    "servers": {
      "redis": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-redis"],
        "env": {
          "REDIS_URL": "${input:redis_url}"
        }
      }
    }
  }
}
```

For Docker installation:

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "redis_url",
        "description": "Redis URL (e.g. redis://host.docker.internal:6379)"
      }
    ],
    "servers": {
      "redis": {
        "command": "docker",
        "args": ["run", "-i", "--rm", "mcp/redis"],
        "env": {
          "REDIS_URL": "${input:redis_url}"
        }
      }
    }
  }
}
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
