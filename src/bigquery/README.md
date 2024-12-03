# BigQuery

A Model Context Protocol server that provides read-only access to BigQuery datasets. This server enables LLMs to inspect dataset schemas and execute read-only queries.

## Components

### Tools

- **query**
  - Execute read-only SQL queries against BigQuery
  - Input: `sql` (string): The SQL query to execute
  - Safety limits: 1GB maximum bytes billed per query

### Resources

The server provides schema information for each table:

- **Table Schemas** (`bigquery://<project-id>/<dataset>/<table>/schema`)
  - JSON schema information for each table
  - Includes column names and data types
  - Automatically discovered from dataset metadata

## Usage with Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bigquery": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-bigquery",
        "your-project-id",
        "location"  // Optional, defaults to us-central1
      ]
    }
  }
}
```

## Authentication

The server uses Google Cloud authentication. Ensure you have:
1. Installed Google Cloud CLI
2. Run `gcloud auth application-default login`
3. Set up appropriate IAM permissions for BigQuery access

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.