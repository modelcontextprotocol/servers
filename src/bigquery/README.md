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

### Via NPX
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

### Local Development
1. Clone the repository
2. Install dependencies:
```bash
npm install
```
Note: If any dependency fails during installation, you can remove it from the root `package.json` and proceed with the installation.

3. Build the project:
```bash
npm run build
```

4. Configure Claude Desktop for local development. Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "bigquery": {
      "command": "node",
      "args": [
        "/path/to/your/clone/servers/src/bigquery/dist/index.js",
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
3. Required IAM Roles:
   - Option 1: `roles/bigquery.user` (recommended)
   - Option 2: Both of these roles:
     - `roles/bigquery.dataViewer` - Grants read access to tables
     - `roles/bigquery.jobUser` - Allows query execution
   
   Note: Contact your GCP administrator to get the necessary roles assigned to your account.

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.