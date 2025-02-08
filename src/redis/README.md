# Redis

A Model Context Protocol server that provides access to Redis databases. This server enables LLMs to interact with Redis key-value stores through a set of standardized tools.

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
* Redis URL can be specified as an argument, defaults to "redis://localhost:6379"

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

## Building

Docker:

```sh
docker build -t mcp/redis -f src/redis/Dockerfile . 
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.