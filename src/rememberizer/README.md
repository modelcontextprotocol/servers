# Rememberizer MCP server

## Overview

A Model Context Protocol server for interacting with Rememberizer's document and knowledge management API. This server enables Large Language Models to search, retrieve, and manage documents and integrations through Rememberizer.

Please note that mcp-server-rememberizer is currently in development and the functionality may be subject to change.

## Components

### Resources

The server provides access to two types of resources:

- Documents (`rememberizer://document/{id}`)
- Slack discussions (`rememberizer://slack/{id}`)

### Tools

1. `rememberizer_search`

   - Search for documents by semantic similarity
   - Input:
     - `q` (string): Up to a 400-word sentence to find semantically similar chunks of knowledge
     - `n` (integer, optional): Number of similar documents to return (default: 5)
     - `from` (string, optional): Start date in ISO 8601 format with timezone (e.g., 2023-01-01T00:00:00Z). Use this to filter results from a specific date (default: None)
     - `to` (string, optional): End date in ISO 8601 format with timezone (e.g., 2024-01-01T00:00:00Z). Use this to filter results until a specific date (default: None)
   - Returns: Search results as text output

2. `rememberizer_agentic_search`

   - Search for documents by semantic similarity with LLM Agents augmentation
   - Input:
     - `query` (string): Up to a 400-word sentence to find semantically similar chunks of knowledge. This query can be augmented by our LLM Agents for better results.
     - `n_chunks` (integer, optional): Number of similar documents to return (default: 5)
     - `user_context` (string, optional): The additional context for the query. You might need to summarize the conversation up to this point for better context-awared results (default: None)
     - `from` (string, optional): Start date in ISO 8601 format with timezone (e.g., 2023-01-01T00:00:00Z). Use this to filter results from a specific date (default: None)
     - `to` (string, optional): End date in ISO 8601 format with timezone (e.g., 2024-01-01T00:00:00Z). Use this to filter results until a specific date (default: None)
   - Returns: Search results as text output

3. `rememberizer_list_integrations`

   - List available data source integrations
   - Input: None required
   - Returns: List of available integrations

4. `rememberizer_account_information`

   - Get account information
   - Input: None required
   - Returns: Account information details

5. `rememberizer_list_documents`

   - Retrieves a paginated list of all documents
   - Input:
     - `page` (integer, optional): Page number for pagination, starts at 1 (default: 1)
     - `page_size` (integer, optional): Number of documents per page, range 1-1000 (default: 100)
   - Returns: List of documents

## Installation

### Using uv (recommended)

When using [`uv`](https://docs.astral.sh/uv/), no specific installation is needed. Use [`uvx`](https://docs.astral.sh/uv/guides/tools/) to directly run _mcp-server-rememberizer_.

### Using PIP

Install `mcp-server-rememberizer` via pip:

`pip install mcp-server-rememberizer`

After installation, run it as a script:

`python -m mcp_server_rememberizer`

## Configuration

### Environment Variables

The following environment variables are required:

- `REMEMBERIZER_API_TOKEN`: Your Rememberizer API token
- `REMEMBERIZER_BASE_URL`: The base URL for the Rememberizer API

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

<details>
<summary>Using uv</summary>

```json
"mcpServers": {
  "rememberizer": {
    "command": "uv",
    "args": [
      "--directory",
      "~/rememberizer-mcp-servers/src/rememberizer",
      "run",
      "mcp-server-rememberizer"
    ]
  }
}
```

</details>

<details>
<summary>Using pip installation</summary>

```json
"mcpServers": {
  "rememberizer": {
    "command": "python",
    "args": ["-m", "mcp_server_rememberizer"]
  }
}
```

</details>

### Usage with [Zed](https://github.com/zed-industries/zed)

Add to your Zed `settings.json`:

<details>
<summary>Using uv</summary>

```json
"context_servers": [
  "mcp-server-rememberizer": {
    "command": {
      "path": "uv",
      "args": ["mcp-server-rememberizer"]
    }
  }
],
```

</details>

<details>
<summary>Using pip installation</summary>

```json
"context_servers": {
  "mcp-server-rememberizer": {
    "command": {
      "path": "python",
      "args": ["-m", "mcp_server_rememberizer"]
    }
  }
},
```

</details>

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
npx @modelcontextprotocol/inspector uv --directory /path/to/directory/rememberizer-mcp-servers/src/rememberizer run mcp-server-rememberizer
```

Upon launching, the Inspector will display a URL that you can access in your browser to begin debugging.

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
