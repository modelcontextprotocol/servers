# Tavily Search MCP Server

An MCP server implementation that integrates the Tavily Search API.
For furhter detais see [https://tavily.com/](https://tavily.com/)


## Tools

- **tavily_search**
  - Performs a Tavily Search query and returns the response
  - Inputs:
    - `query` (string): Search query

## Installation

### Using uv (recommended)

When using [`uv`](https://docs.astral.sh/uv/) no specific installation is needed. We will
use [`uvx`](https://docs.astral.sh/uv/guides/tools/) to directly run *mcp-server-git*.

### Using PIP

Alternatively you can install `mcp-server-tavily` via pip:

```bash
pip install mcp-server-tavily
```

After installation, you can run it as a script using:

```bash
python -m mcp_server_tavily
```


## Configuration

### Pre-requisites
Get an API key for Tavily at [Tavily AI](https://tavily.com/)

### Usage with Claude Desktop
Add this to your `claude_desktop_config.json`:

<details>
<summary>Using uvx</summary>

```json
"mcpServers": {
  "tavily": {
    "command": "uvx",
    "args": ["mcp-server-tavily"],
      "env": {
        "TAVILY_API_KEY": "YOUR_API_KEY_HERE"
      }
  }
}
```
</details>



<details>
<summary>Using pip installation</summary>

```json
"mcpServers": {
  "tavily": {
    "command": "python",
    "args": ["-m", "mcp_server_tavily"]
  }
}
```
</details>

## License

This MCP server is licensed under the MIT License.
This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License.
For more details, please see the LICENSE file in the project repository.
