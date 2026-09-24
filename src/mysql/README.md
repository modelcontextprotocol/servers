# MySQL Database

A Model Context Protocol server that provides read-only access to MySQL databases. This server enables LLMs to inspect database schemas, execute and explain read-only queries, and analyze performance metrics.

## Components

### Tools

- **mysql-query**
  - Execute read-only SQL queries against the connected MySQL database
  - Input: `sql` (string): The SQL query to execute
  - All queries are executed within a READ ONLY transaction

- **mysql-explain**
  - Explain plan SQL queries against the connected MySQL database
  - Input: `sql` (string): The SQL query to explain
  - Returns execution plan in JSON format

- **mysql-stats**
  - Get statistics for a given table in the current connected database
  - Input: `name` (string): The table name
  - Returns comprehensive table, index, and column statistics

- **mysql-connect**
  - Reconnect using new credentials
  - Input: `connectionString` (string): MySQL connect string (e.g., host.docker.internal:3306/mydb)
  - Input: `user` (string): Username (e.g., root)
  - Input: `password` (string): Password

Example:
 mysql-connect host.docker.internal:3306/hr root my_2025

- **mysql-awr**
  - Generate a MySQL performance report similar to Oracle AWR
  - Includes database statistics, InnoDB metrics, top queries (requires performance_schema), table/index statistics, connection info, and optimization recommendations
  - No input required

### Resources

The server provides schema information for each table in the MySQL database:

- **Table Schemas** (`mysql://<database>/<table>/schema`)
  - JSON schema information for each table
  - Includes column names and data types
  - Automatically discovered from MySQL database metadata

## Configuration

The MySQL server uses environment variables or the `mysql-connect` tool for secure credential management:

- **`MYSQL_USER`**: MySQL username (optional if using `mysql-connect`)
- **`MYSQL_PASSWORD`**: MySQL password (optional if using `mysql-connect`)

### Connection String

The connection string should contain only the host, port, and database information (without embedded credentials). Providing it as a command-line argument is **optional**. If omitted at startup, you must use the `mysql-connect` tool to establish a connection before using other functionality.

**Supported connection string formats:**
- `mysql://host:port/dbname`
- `host:port/dbname`

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

* When running Docker on macOS, use `host.docker.internal` if the MySQL server is running on the host network (e.g., localhost)
* Credentials are passed via environment variables `MYSQL_USER` and `MYSQL_PASSWORD`

```json
{
  "mcpServers": {
    "mysql": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm",
        "-e", "MYSQL_USER=myuser",
        "-e", "MYSQL_PASSWORD=mypassword",
        "mochoa/mcp-mysql"
      ]
    }
  }
}
```

Note: You can still provide the connection string as a final argument if you want to connect automatically on startup: `"args": [..., "mochoa/mcp-mysql", "host.docker.internal:3306/mydb"]`.

### NPX

```json
{
  "mcpServers": {
    "mysql": {
      "command": "npx",
      "args": [
        "-y",
        "@marcelo-ochoa/server-mysql"
      ],
      "env": {
        "MYSQL_USER": "myuser",
        "MYSQL_PASSWORD": "mypassword"
      }
    }
  }
}
```

Replace `/mydb` with your database name.

**Note**: Replace the following placeholders with your actual values:
- `myuser` and `mypassword` with your MySQL credentials
- `localhost:3306` with your MySQL server host and port
- `mydb` with your database name

## Usage with VS Code

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open User Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> Note that the `mcp` key is not needed in the `.vscode/mcp.json` file.

### Docker

**Note**: When using Docker and connecting to a MySQL server on your host machine, use `host.docker.internal` instead of `localhost` in the connection URL.

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "mysql_user",
        "description": "MySQL username"
      },
      {
        "type": "promptString",
        "id": "mysql_password",
        "description": "MySQL password",
        "password": true
      }
    ],
    "servers": {
      "mysql": {
        "command": "docker",
        "args": [
          "run",
          "-i",
          "--rm",
          "-e", "MYSQL_USER=${input:mysql_user}",
          "-e", "MYSQL_PASSWORD=${input:mysql_password}",
          "mochoa/mcp-mysql"
        ]
      }
    }
  }
}
```

Note: You can add an input for `mysql_url` and append it to `args` if you want to connect on startup.

### NPX

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "mysql_user",
        "description": "MySQL username"
      },
      {
        "type": "promptString",
        "id": "mysql_password",
        "description": "MySQL password",
        "password": true
      }
    ],
    "servers": {
      "mysql": {
        "command": "npx",
        "args": [
          "-y",
          "@marcelo-ochoa/server-mysql"
        ],
        "env": {
          "MYSQL_USER": "${input:mysql_user}",
          "MYSQL_PASSWORD": "${input:mysql_password}"
        }
      }
    }
  }
}
```

## Usage with Antigravity Code Editor

Put this in `~/.gemini/antigravity/mcp_config.json`

```json
{
    "mcpServers": {
        "mysql": {
            "command": "docker",
            "args": [
                "run",
                "-i",
                "--rm",
                "-e",
                "MYSQL_USER=myuser",
                "-e",
                "MYSQL_PASSWORD=mypassword",
                "mochoa/mcp-mysql",
                "host.docker.internal:3306/mydb"
            ]
        }
    },
    "inputs": []
}
```

## Performance Schema

For optimal performance monitoring with the `mysql-awr` tool, ensure that the Performance Schema is enabled in your MySQL configuration:

```ini
[mysqld]
performance_schema = ON
```

The Performance Schema provides detailed query statistics and performance metrics. If it's not enabled, the AWR report will still generate but with limited query-level statistics.

## Building

Docker:

```sh
docker build -t mochoa/mcp-mysql -f src/mysql/Dockerfile .
```

NPM:

```sh
cd src/mysql
npm install
npm run build
```

## Demo Prompts

Sample prompts to try with the MySQL MCP server:

- Connect to host.docker.internal:3306/mydb using root as user and password123 as password using mysql mcp server
- Query all tables in the current database
- Get stats for the `users` table
- Explain the execution plan for: SELECT * FROM users WHERE email = 'test@example.com'
- Generate a performance report using mysql-awr
- Based on the AWR report, what optimizations would you recommend?

## Demos

See [Demos](https://github.com/marcelo-ochoa/servers/blob/main/src/mysql/Demos.md) for usage examples with Claude Desktop, Docker AI, Gemini CLI, and Antigravity Code Editor.

## MySQL AWR in action

See [MySQL AWR in action](https://github.com/marcelo-ochoa/servers/blob/main/src/mysql/AWR_example.md) for an example of a performance report generated by the `mysql-awr` tool, highlighting specific optimization opportunities.

## Change Log

See [Change Log](https://github.com/marcelo-ochoa/servers/blob/main/src/mysql/CHANGELOG.md) for the history of changes.

## Sources

As usual, the code of this extension is at [GitHub](https://github.com/marcelo-ochoa/servers), feel free to suggest changes and make contributions.

## 📜 License

This project is licensed under the Apache License, Version 2.0 for new contributions, with existing code under MIT - see the [LICENSE](https://github.com/marcelo-ochoa/servers/blob/main/src/mysql/LICENSE) file for details.
