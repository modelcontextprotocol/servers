# PostgreSQL

A Model Context Protocol server that provides read-only access to PostgreSQL databases. This server enables LLMs to inspect database schemas and execute read-only queries.

## Components

### Tools

- **query**
  - Execute read-only SQL queries against the connected database
  - Input: `sql` (string): The SQL query to execute
  - All queries are executed within a READ ONLY transaction

### Resources

The server provides schema information for each table in the database:

- **Table Schemas** (`postgres://<host>/<table>/schema`)
  - JSON schema information for each table
  - Includes column names and data types
  - Automatically discovered from database metadata

## Configuration

### Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

* when running docker on macos, use host.docker.internal if the server is running on the host network (eg localhost)
* username/password can be added to the postgresql url with `postgresql://user:password@host:port/db-name`

```json
{
  "mcpServers": {
    "postgres": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm", 
        "mcp/postgres", 
        "postgresql://host.docker.internal:5432/mydb"]
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://localhost/mydb"
      ]
    }
  }
}
```

Replace `/mydb` with your database name.

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
        "id": "pg_url",
        "description": "PostgreSQL URL (e.g. postgresql://user:pass@host.docker.internal:5432/mydb)"
      }
    ],
    "servers": {
      "postgres": {
        "command": "docker",
        "args": [
          "run",
          "-i",
          "--rm",
          "mcp/postgres",
          "${input:pg_url}"
        ]
      }
    }
  }
}
```

### NPX

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "pg_url",
        "description": "PostgreSQL URL (e.g. postgresql://user:pass@localhost:5432/mydb)"
      }
    ],
    "servers": {
      "postgres": {
        "command": "npx",
        "args": [
          "-y",
          "@modelcontextprotocol/server-postgres",
          "${input:pg_url}"
        ]
      }
    }
  }
}
```

## Building

Docker:

```sh
docker build -t mcp/postgres -f src/postgres/Dockerfile . 
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
