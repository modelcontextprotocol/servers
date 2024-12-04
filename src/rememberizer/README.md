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
     - `n` (integer, optional): Number of similar documents to return
   - Returns: Search results as text output

2. `rememberizer_list_integrations`
   - List available data source integrations
   - Input: None required
   - Returns: List of available integrations

3. `rememberizer_account_information`
   - Get account information
   - Input: None required
   - Returns: Account information details

## Installation

### Using uv (recommended)

When using [`uv`](https://docs.astral.sh/uv/), no specific installation is needed. Use [`uvx`](https://docs.astral.sh/uv/guides/tools/) to directly run *mcp-server-rememberizer*.

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
<summary>Using uvx</summary>

```json
"mcpServers": {
  "rememberizer": {
    "command": "uvx",
    "args": ["mcp-server-rememberizer"]
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
<summary>Using uvx</summary>

```json
"context_servers": [
  "mcp-server-rememberizer": {
    "command": {
      "path": "uvx",
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
npx @modelcontextprotocol/inspector uv --directory /Users/eastagile/Developer/mcp/weather_service run rememberizer
```


Upon launching, the Inspector will display a URL that you can access in your browser to begin debugging.

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
