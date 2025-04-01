# MindsDB MCP Server

A Model Context Protocol server that provides access to hundreds of data sources through MindsDB's SQL interface. This server enables LLMs to query and analyze data across various databases, data warehouses, and applications using standard SQL.

## Features

- **Universal SQL Interface**: Query any supported data source using standard SQL syntax
- **Cross-Database Joins**: Join data across different databases and platforms
- **Automatic Dialect Translation**: MindsDB handles the translation between SQL dialects
- **Wide Data Source Support**: 
  - Databases: MySQL, PostgreSQL, MongoDB, MariaDB, etc.
  - Data Warehouses: Snowflake, BigQuery, Redshift, etc.
  - Applications:  Salesforce, HubSpot, SAP, etc.
  - FileSystems: S3, GCS, Azure, GoogleDrive, etc.
  - Files: CSV, JSON, Parquet, etc.


## Components

### Tools

- **query**
  - Execute SQL queries against any connected data source
  - Input: `sql` (string): Standard MySQL or MindsDB SQL query (MindsDB handles dialect translation to other data sources) 
  - MindsDB automatically handles:
    - SQL dialect translation
    - Query federation
    - Connection management
    - Data type conversions
    - Cross-database operations

### Resources

The server provides schema information for tables across all connected data sources:

- **Table Schemas** (`mindsdb://<integration>/<table>/<schema>`)
  - JSON schema information for each table
  - Includes column names and data types
  - Automatically discovered from data source metadata

## Usage Examples

### Basic Queries
```sql
-- Query MySQL database
SELECT * FROM mysql_integration.customers;

-- Query Postgres database
SELECT * FROM postgres_integration.orders;

-- Cross-database join
SELECT c.name, o.order_date, o.amount 
FROM mysql_integration.customers c
JOIN postgres_integration.orders o 
ON c.id = o.customer_id;

-- Query application data
SELECT * FROM salesforce_integration.leads;
```

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

```json
{
  "mcpServers": {
    "mindsdb": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm", 
        "mcp/mindsdb", 
        "mysql://user:pass@host:port/mindsdb"]
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "mindsdb": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-mindsdb",
        "mysql://user:pass@host:port/mindsdb"
      ]
    }
  }
}
```

## Building

Docker:

```sh
docker build -t mcp/mindsdb -f src/mindsdb/Dockerfile . 
```

## Configuration

1. Set up MindsDB instance (cloud or self-hosted) [https://docs.mindsdb.com]
2. Create integrations to your data sources in MindsDB
3. Connect the MCP server to MindsDB using the MySQL wire protocol

## Limitations

- Query performance depends on the underlying data sources
- Write operations require appropriate permissions on the target data sources

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
