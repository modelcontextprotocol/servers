# Oracle Database

A Model Context Protocol server that provides read-only access to Oracle Database. This server enables LLMs to inspect database schemas, execute and explain read-only queries.

## Components

### Tools

- **orcl-query**
  - Execute read-only SQL queries against the connected Oracle Database
  - Input: `sql` (string): The SQL query to execute
  - All queries are executed within a READ ONLY transaction

- **orcl-explain**
  - Explain plan SQL queries against the connected Oracle Database
  - Input: `sql` (string): The SQL query to execute
  - Requires GRANT SELECT_CATALOG_ROLE TO your_user;

- **orcl-stats**
  - Get statistics for a given table on current connected schema
  - Input: `name` (string): The table name
  - Table owner is equal to USER SQL function returning value

- **orcl-connect**
  - Reconnect using new credentials
  - Input: `connectionString` (string): SQLNet connect string for example host.docker.internal:1521/freepdb1
  - Input: `user` (string): Username for example scott
  - Input: `password` (string): Password, for example tiger

Example:
 orcl-connect host.docker.internal:1521/freepdb1 hr hr_2025

- **orcl-awr**
  - Automatic Workload Repository (AWR) with optional sql_id, requires SELECT_CATALOG_ROLE and grant execute on DBMS_WORKLOAD_REPOSITORY package
  - Input: `sql_id` (string): (optional) SQL id to get the AWR report for an specific query, if null full last generated AWR report

### Resources

The server provides schema information for each table in the Oracle Database current connected user:

- **Table Schemas** (`oracle://USER/<table>/schema`)
  - JSON schema information for each table
  - Includes column names and data types
  - Automatically discovered from Oracle Database metadata

## Change Log

See [Change Log](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/CHANGELOG.md) for the history of changes.

## Demos

See [Demos](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/Demos.md) for usage examples with Claude Desktop, Docker AI, Gemini CLI, and Antigravity Code Editor.


## Oracle AWR in action

See [Oracle AWR in action](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/AWR_example.md) for an example of an AWR report generated using the `orcl-awr` tool, followed by an analysis of the top SQL statements.


The Oracle server uses environment variables or the `orcl-connect` tool for secure credential management:

- **`ORACLE_USER`**: Oracle username (optional if using `orcl-connect`)
- **`ORACLE_PASSWORD`**: Oracle password (optional if using `orcl-connect`)

### Connection String

The connection string should contain only the host, port, and service/SID information (without embedded credentials). Providing it as a command-line argument is **optional**. If omitted at startup, you must use the `orcl-connect` tool to establish a connection before using other functionality.

**Supported connection string formats:**
- `host:port/service_name`
- `host:port:SID`

## Building

Docker:

```sh
docker build -t mochoa/mcp-oracle -f src/oracle/Dockerfile .
```

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

* When running Docker on macOS, use `host.docker.internal` if the Oracle Database is running on the host network (e.g., localhost)
* Credentials are passed via environment variables `ORACLE_USER` and `ORACLE_PASSWORD`

```json
{
  "mcpServers": {
    "oracle": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm",
        "-e", "ORACLE_USER=myuser",
        "-e", "ORACLE_PASSWORD=mypassword",
        "mochoa/mcp-oracle",
        "host.docker.internal:1521/freepdb1"
      ]
    }
  }
}
```

Note: You can still provide the connection string as a final argument if you want to connect automatically on startup: `"args": [..., "mochoa/mcp-oracle", "host.docker.internal:1521/freepdb1"]`.

## Sources

As usual the code of this extension is at [GitHub](https://github.com/marcelo-ochoa/servers), feel free to suggest changes and make contributions, note that I am a beginner developer of React and TypeScript so contributions to make this UI better are welcome.

## Compared to SQLcl MCP server

Using SQLcl Docker extension you could register a connection using:

```sh
docker exec --user sqlcl -ti mochoa_sqlcl-docker-extension-desktop-extension-service /opt/sqlcl/bin/sql -save hr_mcp -savepwd hr/hr_2025@host.docker.internal:1521/freepdb1   
```

after that using this registration:

```yml
{
  "mcpServers": {
    "sqlcl-mcp-server": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "exec",
        "--user",
        "sqlcl",
        "-i",
        "mochoa_sqlcl-docker-extension-desktop-extension-service",
        "/opt/sqlcl/bin/sql",
        "-mcp"
      ]
    }
  }
}
```

Just replace above Demo prompts instead of "orcl-query" tool use "run-sql".

## 📜 License

This project is licensed under the Apache License, Version 2.0 for new contributions, with existing code under MIT - see the [LICENSE](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/LICENSE) file for details.
