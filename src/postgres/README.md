# PostgreSQL

A Model Context Protocol server that provides read-only access to PostgreSQL databases. This server enables LLMs to inspect database schemas and execute read-only queries.

## Components

### Tools

- **pg-query**
  - Execute read-only SQL queries against the connected database
  - Input: `sql` (string): The SQL query to execute
  - All queries are executed within a READ ONLY transaction

- **pg-stats**
  - Get statistics for a specific table
  - Input: `name` (string): The name of the table to get statistics for

- **pg-explain**
  - Explain Plan for a given SQL query
  - Input: `sql` (string): The SQL query to explain

- **pg-connect**
  - Connect to a PostgreSQL database
  - Inputs:
    - `connectionString` (string): The PostgreSQL connection string without credentials (e.g. postgresql://host:port/dbname or host:port/dbname)
    - `user` (string): The PostgreSQL username
    - `password` (string): The PostgreSQL password

Example:
 pg-connect host.docker.internal:5432/postgres postgres pg_2025

- **pg-awr**
  - Generate a PostgreSQL performance report similar to Oracle AWR. Includes database statistics, top queries (requires pg_stat_statements extension), table/index statistics, connection info, and optimization recommendations.

### Resources

The server provides schema information for each table in the database:

- **Table Schemas** (`postgres://<dbname>/<table>/schema`)
  - JSON schema information for each table
  - Includes column names and data types
  - Automatically discovered from database metadata

## Change Log

See [Change Log](https://github.com/marcelo-ochoa/servers/blob/main/src/postgres/CHANGELOG.md) for the history of changes.

## Configuration

The PostgreSQL server uses environment variables or the `pg-connect` tool for secure credential management:

- **`PG_USER`**: PostgreSQL username (optional if using `pg-connect`)
- **`PG_PASSWORD`**: PostgreSQL password (optional if using `pg-connect`)

### Connection String

The connection string should contain only the host, port, and database information (without embedded credentials). Providing it as a command-line argument is **optional**. If omitted at startup, you must use the `pg-connect` tool to establish a connection before using other functionality.

**Supported connection string formats:**
- `postgresql://host:port/dbname`
- `host:port/dbname`

To enable encryption (SSL), append `?sslmode=require` to the connection string or set the `PG_SSL` environment variable to `true`.

### Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

* When running Docker on macOS, use `host.docker.internal` if the PostgreSQL server is running on the host network (e.g., localhost)
* Credentials are passed via environment variables `PG_USER` and `PG_PASSWORD`

```json
{
  "mcpServers": {
    "postgres": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm",
        "-e", "PG_USER=myuser",
        "-e", "PG_PASSWORD=mypassword",
        "mochoa/mcp-postgres"
      ]
    }
  }
}
```

Note: You can still provide the connection string as a final argument if you want to connect automatically on startup: `"args": [..., "mochoa/mcp-postgres", "postgresql://host.docker.internal:5432/mydb"]`.

### NPX

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@marcelo-ochoa/server-postgres",
        "postgresql://localhost:5432/mydb"
      ],
      "env": {
        "PG_USER": "myuser",
        "PG_PASSWORD": "mypassword"
      }
    }
  }
}
```

Replace `/mydb` with your database name.

**Note**: Replace the following placeholders with your actual values:
- `myuser` and `mypassword` with your PostgreSQL credentials
- `localhost:5432` with your PostgreSQL server host and port
- `mydb` with your database name

### Usage with VS Code

For quick installation, use one of the one-click install buttons below...

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=postgres&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22pg_url%22%2C%22description%22%3A%22PostgreSQL%20URL%20(e.g.%20postgresql%3A%2F%2Fuser%3Apass%40localhost%3A5432%2Fmydb)%22%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-postgres%22%2C%22%24%7Binput%3Apg_url%7D%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=postgres&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22pg_url%22%2C%22description%22%3A%22PostgreSQL%20URL%20(e.g.%20postgresql%3A%2F%2Fuser%3Apass%40localhost%3A5432%2Fmydb)%22%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-postgres%22%2C%22%24%7Binput%3Apg_url%7D%22%5D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=postgres&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22pg_url%22%2C%22description%22%3A%22PostgreSQL%20URL%20(e.g.%20postgresql%3A%2F%2Fuser%3Apass%40host.docker.internal%3A5432%2Fmydb)%22%7D%5D&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Fpostgres%22%2C%22%24%7Binput%3Apg_url%7D%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=postgres&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22pg_url%22%2C%22description%22%3A%22PostgreSQL%20URL%20(e.g.%20postgresql%3A%2F%2Fuser%3Apass%40host.docker.internal%3A5432%2Fmydb)%22%7D%5D&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Fpostgres%22%2C%22%24%7Binput%3Apg_url%7D%22%5D%7D&quality=insiders)

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open User Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> Note that the `mcp` key is not needed in the `.vscode/mcp.json` file.

### Docker

**Note**: When using Docker and connecting to a PostgreSQL server on your host machine, use `host.docker.internal` instead of `localhost` in the connection URL.

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "pg_user",
        "description": "PostgreSQL username"
      },
      {
        "type": "promptString",
        "id": "pg_password",
        "description": "PostgreSQL password",
        "password": true
      }
    ],
    "servers": {
      "postgres": {
        "command": "docker",
        "args": [
          "run",
          "-i",
          "--rm",
          "-e", "PG_USER=${input:pg_user}",
          "-e", "PG_PASSWORD=${input:pg_password}",
          "mochoa/mcp-postgres",
          "postgresql://localhost:5432/mydb"
        ]
      }
    }
  }
}
```

Note: You can add an input for `pg_url` and append it to `args` if you want to connect on startup.

### NPX

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "pg_user",
        "description": "PostgreSQL username"
      },
      {
        "type": "promptString",
        "id": "pg_password",
        "description": "PostgreSQL password",
        "password": true
      }
    ],
    "servers": {
      "postgres": {
        "command": "npx",
        "args": [
          "-y",
          "@marcelo-ochoa/server-postgres",
          "postgresql://localhost:5432/mydb"
        ],
        "env": {
          "PG_USER": "${input:pg_user}",
          "PG_PASSWORD": "${input:pg_password}"
        }
      }
    }
  }
}
```

## PostgreSQL AWR in action

See [PostgreSQL AWR in action](https://github.com/marcelo-ochoa/servers/blob/main/src/postgres/AWR_example.md) for an example of a performance report generated by the `pg-awr` tool for a production Moodle database, highlighting critical performance issues and optimization opportunities.

## Demos

See [Demos](https://github.com/marcelo-ochoa/servers/blob/main/src/postgres/Demos.md) for usage examples with Claude Desktop, Docker AI, Gemini CLI, and Antigravity Code Editor.

## Building

Docker:

```sh
docker build -t mochoa/mcp-postgres -f src/postgres/Dockerfile .
```

## Sources

As usual the code of this extension is at [GitHub](https://github.com/marcelo-ochoa/servers), feel free to suggest changes and make contributions, note that I am a beginner developer of React and TypeScript so contributions to make this UI better are welcome.

## 📜 License

This project is licensed under the Apache License, Version 2.0 for new contributions, with existing code under MIT - see the [LICENSE](https://github.com/marcelo-ochoa/servers/blob/main/src/postgres/LICENSE) file for details.

