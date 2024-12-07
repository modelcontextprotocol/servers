# Microsoft SQL Server

A Model Context Protocol server that provides read-only access to Microsoft SQL Server databases. This server enables LLMs to inspect database schemas and execute read-only queries.

## Components

### Tools

- query
 - Execute read-only SQL queries against the connected database
 - Input: `sql` (string): The SQL query to execute 
 - All queries are executed within a connection pool for optimal performance

### Resources

The server provides schema information for each table in the database:

- Table Schemas (`mssql://<table>/schema`)
 - JSON schema information for each table
 - Includes column names and data types
 - Automatically discovered from database metadata

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mssql": {
      "command": "node",
      "args": [
        "/YOUR PATH/mcp-server/Bangkok-MCP-Server/src/mssql/dist/index.js",
        "{\"server\":\"MSSQL IP ADDRESS\",\"database\":\"DATABASE NAME\",\"user\":\"USERNAME\",\"password\":\"PASSWORD\",\"options\":{\"trustServerCertificate\":true}}"
      ]
    }
  }
}
```

Replace the connection string with your database credentials.

## Connection Configuration

The server supports the following connection options:

- User authentication
- Connection pooling (max 10 connections)
- TLS/SSL encryption (configurable)
- Idle timeout management 
- Trust server certificate options

## Installation

```bash
npm install @modelcontextprotocol/server-mssql
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.