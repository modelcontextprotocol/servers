# mcp-server-s3: An S3 MCP server

## Overview

A Model Context Protocol (MCP) server implementation for searching and analyzing documents stored in Amazon S3. This server provides a standardized way for AI models to access and search through documents stored in S3 buckets.

Please note that mcp-server-s3 is currently in early development. The functionality and available tools are subject to change and expansion as we continue to develop and improve the server.

### Tools
1. `list_files`
    - List files in S3 bucket
    - Input:
        - `prefix` (string, optional): Prefix to filter files by for a particular bucket
    - Returns: Array of file paths in the bucket matching the prefix
2. `get_file_content`
    - Get content of a file in S3 bucket
    - Input:
        - `key` (string): Path to file in S3 bucket
    - Returns: Content of the file as text output
3. `analyze_file`
   - Analyze a file in S3 bucket
   - Input:
     - `key` (string): Path to file in S3 bucket
    - Returns: Analysis of the file as text output with metadata

4. `search_file`
   - Search for a string in a file in S3 bucket
   - Inputs:
     - `key` (string): Path to file in S3 bucket
     - `query` (string): String to search for in the file
   - Returns: Array of search results with line number and content

## Installation

### Using uv (recommended)

When using [`uv`](https://docs.astral.sh/uv/) no specific installation is needed. We will
use [`uvx`](https://docs.astral.sh/uv/guides/tools/) to directly run *s3-mcp-server*.

### Using PIP

Alternatively you can install `mcp-server-s3` via pip:

```
pip install mcp-server-s3
```

After installation, you can run it as a script using:

```
python -m mcp_server_s3
```

## Configuration

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

<details>
<summary>Using uvx</summary>

```json
"mcpServers": {
  "s3": {
    "command": "uvx",
    "args": ["mcp-server-s3", "--bucket_name", "name-of-your-bucket"]
  }
}
```
</details>

<details>
<summary>Using pip installation</summary>

```json
"mcpServers": {
  "s3": {
    "command": "python",
    "args": ["-m", "mcp_server_s3", "--bucket_name", "name-of-your-bucket"]
  }
}
```
</details>

### Usage with [Zed](https://github.com/zed-industries/zed)

Add to your Zed settings.json:

<details>
<summary>Using uvx</summary>

```json
"context_servers": [
<<<<<<< Updated upstream
  "mcp-server-s3": {
    "command": {
      "path": "uvx",
      "args": ["mcp-server-s3"]
    }
=======
  "mcp-server-s3": {
    "command": "uvx",
    "args": ["mcp-server-s3"]
>>>>>>> Stashed changes
  }
],
```
</details>

<details>
<summary>Using pip installation</summary>

```json
"context_servers": {
<<<<<<< Updated upstream
  "mcp-server-s3": {
    "command": {
      "path": "python",
      "args": ["-m", "mcp_server_s3"]
    }
=======
  "mcp-server-s3": {
    "command": "python",
    "args": ["-m", "mcp_server_s3"]
>>>>>>> Stashed changes
  }
},
```
</details>

## Debugging

You can use the MCP inspector to debug the server. For uvx installations:

```
npx @modelcontextprotocol/inspector uvx mcp-server-s3
```

Or if you've installed the package in a specific directory or are developing on it:

```
cd path/to/servers/src/s3
npx @modelcontextprotocol/inspector uv run mcp-server-s3
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
