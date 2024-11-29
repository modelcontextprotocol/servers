# MySQL MCP Server

This server provides access to MySQL databases through the Model Context Protocol.

## Installation

```bash
npm install @modelcontextprotocol/server-mysql
```

## Usage

```bash
mcp-server-mysql mysql://user:password@localhost:3306/database
```

The server accepts a MySQL connection URL as its only argument. This URL should include:
- Username and password
- Host and port
- Database name

## Features

### Resources

The server exposes database tables as resources. Each table has a schema resource that describes its structure.

### Tools

#### query

Executes a read-only SQL query against the database. The query is executed within a read-only transaction to ensure data safety.

Example:
```json
{
  "sql": "SELECT * FROM users LIMIT 5"
}
