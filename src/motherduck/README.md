# mcp-server-motherduck MCP server

A MCP server for MotherDuck and local DuckDB 

## Components

### Resources

### Prompts

The server provides one prompt:
- duckdb-motherduck-initial-prompt: A prompt to initialize a connection to duckdb or motherduck and start working with it

### Tools

The server offers three tools:
- initialize-connection: Create a connection to either a local DuckDB or MotherDuck and retrieve available databases
  - Takes "type" (DuckDB or MotherDuck) as input
- read-schemas: Get table schemas from a specific DuckDB/MotherDuck database
  - Takes "database_name" as required string arguments
- execute-query: Execute a query on the MotherDuck (DuckDB) database
  - Takes "query" as required string arguments

## Usage with Claude Desktop

Add the snippet below to your Claude Desktop config and make sure to set the HOME var to your home folder (needed by DuckDB). 

When using MotherDuck, you also need to set a [MotherDuck token](https://motherduck.com/docs/key-tasks/authenticating-and-connecting-to-motherduck/authenticating-to-motherduck/#storing-the-access-token-as-an-environment-variable) env var.

On MacOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

### Servers Configuration
```
"mcpServers": {
  "mcp-server-motherduck": {
    "command": "uvx",
    "args": [
      "mcp-server-motherduck"
    ],
    "env": {
      "motherduck_token": "",
      "HOME": ""
    }
  }
}
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.

