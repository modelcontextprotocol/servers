# Neo4j MCP Server

## Overview
A Model Context Protocol (MCP) server implementation that provides database interaction and allows graph exploration capabilities through neo4j. This server enables running Cypher graph queries, analyzing complex domain data, and automatically generating business insights that can be enhanced with Claude's analysis when an Anthropic API key is provided.

## Components

### Resources

### Prompts
The server provides a demonstration prompt:
- `mcp-demo`: Interactive prompt that guides users through database operations
  - Generates appropriate database schemas and sample data

### Tools
The server offers six core tools:

#### Query Tools
- `read-neo4j-cypher`
   - Execute Cypher read queries to read data from the database
   - Input: 
     - `query` (string): The Cypher query to execute
   - Returns: Query results as array of objects

- `write-neo4j-cypher`
   - Execute updating Cypher queries
   - Input:
     - `query` (string): The Cypher update query
   - Returns: a result summary counter with `{ nodes_updated: number, relationships_created: number, ... }`

#### Schema Tools
- `get-neo4j-schema`
   - Get a list of all nodes types in the graph database, their attributes with name, type and relationships to other node types
   - No input required
   - Returns: List of node label with two dictionaries one for attributes and one for relationships

## Usage with Claude Desktop

```bash
# Add the server to your claude_desktop_config.json
"mcpServers": {
  "neo4j": {
    "command": "uv",
    "args": [
      "--directory",
      "parent_of_servers_repo/servers/src/neo4j",
      "run",
      "mcp-server-neo4j",
      "--db-url",
      "bolt://localhost",
      "--username",
      "neo4j",
      "--password",
      "<your-password>"
    ]
  }
}
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
