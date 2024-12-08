# MSSQL

A Model Context Protocol (MCP) server that provides read-only access to Microsoft SQL Server (MSSQL) databases. This server allows Large Language Models (LLMs) to inspect database schemas and execute read-only queries.

## Overview

This tool exposes MSSQL database schemas and enables read-only SQL execution. It is designed to be flexible, using environment variables to specify the database schema and resource paths.

## Configuration

The server can be influenced by the following environment variables:

- **DB_SCHEMA**: The database schema to use when listing tables and fetching their columns. Defaults to `dbo`.
- **RESOURCE_SCHEMA_PATH**: The suffix used to fetch table schema information. Defaults to `schema`.

For example, if `RESOURCE_SCHEMA_PATH` is `schema` and the table name is `Users`, the resource URI would be: mssql://Users/schema

This URI returns a JSON representation of the columns and data types for the `Users` table.

## Components

### Tools

- **query**
  - Execute read-only SQL queries against the connected MSSQL database.
  - Input: `sql` (string) - The SQL query to execute.
  - All queries are executed within a transaction and rolled back afterwards, ensuring no changes are applied to the database.

### Resources

- **Table Schemas** (`mssql://<tableName>/<RESOURCE_SCHEMA_PATH>`)
  - JSON schema details for each table, including column names and data types.
  - The tables are automatically discovered from the specified `DB_SCHEMA`.

## Example Usage with Claude Desktop

To use this MSSQL server with the Claude Desktop application, add a new entry to the `mcpServers` section of your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mssql": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-mssql",
        "Server=myServerAddress;Database=myDataBase;User Id=myUsername;Password=myPassword;"
      ],
      "env": {
        "DB_SCHEMA": "dbo",
        "RESOURCE_SCHEMA_PATH": "schema"
      }
    }
  }
}
```

Adjust the connection string, `DB_SCHEMA`, and `RESOURCE_SCHEMA_PATH` as necessary for your environment and requirements.

## License

This MCP server is licensed under the MIT License. You are free to use, modify, and distribute this software under the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
