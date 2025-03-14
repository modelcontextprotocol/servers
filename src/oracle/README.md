# Oracle

A Model Context Protocol server that provides read-only access to Oracle databases. This server enables LLMs to inspect database schemas, execute and explain read-only queries.

## Components

### Tools

- **query**
  - Execute read-only SQL queries against the connected database
  - Input: `sql` (string): The SQL query to execute
  - All queries are executed within a READ ONLY transaction

- **explain**
  - Explain plan SQL queries against the connected database
  - Input: `sql` (string): The SQL query to execute
  - Requires GRANT SELECT_CATALOG_ROLE TO your_user;

### Resources

The server provides schema information for each table in the database current connected user:

- **Table Schemas** (`oracle://USER/<table>/schema`)
  - JSON schema information for each table
  - Includes column names and data types
  - Automatically discovered from database metadata

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

* when running docker on MacOS, use host.docker.internal if the server is running on the host network (eg localhost)
* username/password must be passed as environment variable

```json
{
  "mcpServers": {
    "oracle": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm", 
        "-e",
        "ORACLE_USER=scott",
        "-e",
        "ORACLE_PASSWORD=tiger",
        "mcp/oracle", 
        "host.docker.internal:1521/freepdb1"]
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "oracle": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-oracle",
        "host.docker.internal:1521/freepdb1"
      ]
    }
  }
}
```

Replace `/freepdb1` with your database name.

### Demo Prompts

Sample prompts using Oracle HR schema and 
[OracleFree 23c embedded RDBMS - Faststart - Docker Desktop Extension](https://open.docker.com/extensions/marketplace?extensionId=mochoa/oraclefree-docker-extension) .

- query SELECT COUNTRY_NAME, CITY, COUNT(DEPARTMENT_ID)
FROM COUNTRIES JOIN LOCATIONS USING (COUNTRY_ID) JOIN DEPARTMENTS USING (LOCATION_ID) 
WHERE DEPARTMENT_ID IN 
    (SELECT DEPARTMENT_ID FROM EMPLOYEES 
   GROUP BY DEPARTMENT_ID 
   HAVING COUNT(DEPARTMENT_ID)>5)
GROUP BY COUNTRY_NAME, CITY
- explain the execution plan
- visualize above execution plan
- rewrite above query with a better execution plan

See in action using Claude Desktop App

![Oracle MCP Server demo](./demo-prompts.gif)

## Building

Docker:

```sh
docker build -t mcp/oracle -f src/oracle/Dockerfile . 
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
