# BigQuery MCP server

A Model Context Protocol server that provides access to BigQuery. This server enables LLMs to inspect database schemas and execute queries.

## Components

### Tools

The server implements one tool:

- `execute-query`: Executes a SQL query using BigQuery dialect
- `list-tables`: Lists all tables in the BigQuery database
- `describe-table`: Describes the schema of a specific table

## Configuration

The server can be configured with the following arguments:

- `--project` (required): The GCP project ID.
- `--location` (required): The GCP location (e.g. `europe-west9`).
- `--dataset` (optional): Only take specific BigQuery datasets into consideration. Several datasets can be specified by repeating the argument (e.g. `--dataset my_dataset_1 --dataset my_dataset_2`). If not provided, all tables in the project will be considered.

## Quickstart

### Install

#### Claude Desktop

On MacOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

<details>
  <summary>Development/Unpublished Servers Configuration</summary>
  ```
  "mcpServers": {
    "bigquery": {
      "command": "uv",
      "args": [
        "--directory",
        "{{PATH_TO_REPO}}",
        "run",
        "mcp-server-bigquery",
        "--project",
        "{{GCP_PROJECT_ID}}",
        "--location",
        "{{GCP_LOCATION}}"
      ]
    }
  }
  ```
</details>

<details>
  <summary>Published Servers Configuration</summary>
  ```
  "mcpServers": {
    "bigquery": {
      "command": "uvx",
      "args": [
        "mcp-server-bigquery",
        "--project",
        "{{GCP_PROJECT_ID}}",
        "--location",
        "{{GCP_LOCATION}}"
      ]
    }
  }
  ```
</details>

Replace `{{PATH_TO_REPO}}`, `{{GCP_PROJECT_ID}}`, and `{{GCP_LOCATION}}` with the appropriate values.

## Development

### Building and Publishing

To prepare the package for distribution:

1. Sync dependencies and update lockfile:

```bash
uv sync
```

2. Build package distributions:

```bash
uv build
```

This will create source and wheel distributions in the `dist/` directory.

3. Publish to PyPI:

```bash
uv publish
```

Note: You'll need to set PyPI credentials via environment variables or command flags:

- Token: `--token` or `UV_PUBLISH_TOKEN`
- Or username/password: `--username`/`UV_PUBLISH_USERNAME` and `--password`/`UV_PUBLISH_PASSWORD`

### Debugging

Since MCP servers run over stdio, debugging can be challenging. For the best debugging
experience, we strongly recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector).

You can launch the MCP Inspector via [`npm`](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) with this command:

```bash
npx @modelcontextprotocol/inspector uv --directory {{PATH_TO_REPO}} run mcp-server-bigquery
```

Upon launching, the Inspector will display a URL that you can access in your browser to begin debugging.
