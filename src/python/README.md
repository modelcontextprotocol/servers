# mcp-server-python: An MCP Server for Python REPL

An MCP Server that provides an interactive Python REPL (Read-Eval-Print Loop) environment.

## Warning

This server allows LLMs to execute arbitrary Python code. Be sure to understand the code you are running and the resources it will have access to. Do not run this server in a production environment or sensitive environments. Review LLM code before running it. We provide no warranties or guarantees about the safety or security of this server.

## Components

### Resources

The server provides access to REPL session history:
- Custom `repl://` URI scheme for accessing session history
- Each session's history can be viewed as a text/plain resource
- History shows input code and corresponding output for each execution

### Tools

The server implements one tool:
- `python_repl`: Executes Python code in a persistent session
  - Takes `code` (Python code to execute) and `session_id` as required arguments
  - Maintains separate state for each session
  - Supports both expressions and statements
  - Captures and returns stdout/stderr output

## Configuration

## Installation

### Using uv (recommended)

When using [`uv`](https://docs.astral.sh/uv/) no specific installation is needed. We will
use [`uvx`](https://docs.astral.sh/uv/guides/tools/) to directly run *mcp-server-git*.

### Using PIP

Alternatively you can install `mcp-server-git` via pip:

```
pip install mcp-server-git
```

After installation, you can run it as a script using:

```
python -m mcp_server_git
```

## Configuration

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

<details>
<summary>Using uvx</summary>

```json
"mcpServers": {
  "python": {
    "command": "uvx",
    "args": ["mcp-server-python"]
  }
}
```
</details>

<details>
<summary>Using pip installation</summary>

```json
"mcpServers": {
  "python": {
    "command": "python",
    "args": ["-m", "mcp_server_python"]
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
  "python": {
    "command": {
      "path": "uvx",
      "args": ["mcp-server-python"]
    }
  }
],
```
</details>

<details>
<summary>Using pip installation</summary>

```json
"context_servers": {
  "python": {
    "command": {
      "path": "python",
      "args": ["-m", "mcp_server_python"]
    }
  }
},
```
</details>

## Debugging

You can use the MCP inspector to debug the server. For uvx installations:

```
npx @modelcontextprotocol/inspector uvx mcp-server-python
```

Or if you've installed the package in a specific directory or are developing on it:

```
cd path/to/servers/src/python
npx @modelcontextprotocol/inspector uv run mcp-server-python
```

Running `tail -n 20 -f ~/Library/Logs/Claude/mcp*.log` will show the logs from the server and may
help you debug any issues.

## Development

If you are doing local development, there are two ways to test your changes:

1. Run the MCP inspector to test your changes. See [Debugging](#debugging) for run instructions.

2. Test using the Claude desktop app. Add the following to your `claude_desktop_config.json`:

```json
"git": {
  "command": "uv",
  "args": [
    "--directory",
    "/<path to mcp-servers>/mcp-servers/src/python",
    "run",
    "mcp-server-python"
  ]
}
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
