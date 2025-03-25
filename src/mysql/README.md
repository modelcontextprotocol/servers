# MySQL

A Model Context Protocol server that provides read-only access to MySQL databases. This server enables LLMs to inspect database schemas and execute read-only queries.

## Authentication

The server supports MySQL authentication through the database URL. The URL format is:

```
mysql://username:password@host:port/database
```

Examples:

- Basic authentication: `mysql://user:pass@localhost:3306/mydb`
- Without password: `mysql://user@localhost:3306/mydb`
- Default port (3306): `mysql://user:pass@localhost/mydb`

**Note**: Always ensure your credentials are properly secured and not exposed in public configurations.

## Components

### Tools

- **query**
  - Execute read-only SQL queries against the connected database
  - Input: `sql` (string): The SQL query to execute
  - All queries are executed within a READ ONLY transaction
  - Authentication is handled automatically using the provided credentials

### Resources

The server provides schema information for each table in the database:

- **Table Schemas** (`mysql://<host>/<table>/schema`)
  - JSON schema information for each table
  - Includes column names and data types
  - Automatically discovered from database metadata
  - Access is authenticated using the provided credentials

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

```json
{
  "mcpServers": {
    "mysql": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "mcp/mysql",
        "mysql://user:password@host:3306/mydb"
      ]
    }
  }
}
```

**Important Docker networking notes:**

- When running Docker on macOS, use `host.docker.internal` instead of `localhost` to connect to the host network
- For Docker networks, ensure the MySQL host is accessible from the container
- Example with host.docker.internal: `mysql://user:password@host.docker.internal:3306/mydb`

### NPX

```json
{
  "mcpServers": {
    "mysql": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-mysql",
        "mysql://user:password@localhost:3306/mydb"
      ]
    }
  }
}
```

### Security Best Practices

1. Use environment variables for sensitive credentials:

   ```json
   {
     "mcpServers": {
       "mysql": {
         "command": "docker",
         "args": [
           "run",
           "-i",
           "--rm",
           "mcp/mysql",
           "mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@host:3306/mydb"
         ]
       }
     }
   }
   ```

2. Ensure the MySQL user has minimal required permissions (READ-ONLY access)
3. Use strong passwords and follow security best practices
4. Avoid committing configuration files with credentials to version control

## Building

Docker:

```sh
docker build -t mcp/mysql -f src/mysql/Dockerfile .
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
