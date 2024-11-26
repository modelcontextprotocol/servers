# Zep MCP server

MCP server for using Zep long term memory with Claude

## What is Zep? 💬
Zep is a long-term memory service for AI Assistant apps. With Zep, you can provide AI assistants with the ability to recall past conversations, no matter how distant, while also reducing hallucinations, latency, and cost.

> [!NOTE]
> Zep Cloud [overview](https://help.getzep.com/concepts)

## Components

### Prompts

The server provides two prompts:
- `memory-context`: Retrieves memory context for the current conversation
- `add-memory`: Adds new messages to the conversation memory
  - Takes "messages" argument as JSON array of message objects
  - Each message requires `role_type` and `content`

### Tools

The server implements two tools:
- `add-memory`: Adds new messages to the conversation memory
  - Takes array of message objects with `role_type` and `content`
  - Must be used after every message exchange to maintain history
  - Supports role types: system, assistant, user, function, tool
  
- `get-memory`: Retrieves memory context for the current conversation
  - Returns contextual information from previous exchanges
  - Useful for maintaining conversation continuity

## Configuration

### Environment Variables

- `ZEP_API_KEY`: Required API key for Zep service authentication. Expected to be passed as `--api-key` flag as Servers don't yet support setting environment variables. You can get it from project settings in Zep Cloud.

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

<details>
<summary>Using uvx</summary>

```json
"mcpServers": {
  "zep": {
    "command": "uvx",
    "args": ["mcp-server-zep", "--api-key", "YOUR_API_KEY"]
  }
}
```
</details>

<details>
<summary>Using pip installation</summary>

```json
"mcpServers": {
  "mcp-server-zep": {
    "command": "python",
    "args": ["-m", "mcp-server-zep", "--api-key", "YOUR_API_KEY"]
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
  "mcp-server-zep": {
    "command": "uvx",
    "args": ["mcp-server-zep", "--api-key", "YOUR_API_KEY"]
  }
],
```
</details>

<details>
<summary>Using pip installation</summary>

```json
"context_servers": {
  "mcp-server-zep": {
    "command": "python",
    "args": ["-m", "mcp-server-zep", "--api-key", "YOUR_API_KEY"]
  }
},
```
</details>

## Debugging

You can use the MCP inspector to debug the server. For uvx installations:

```
npx @modelcontextprotocol/inspector uvx mcp-server-zep --api-key YOUR_API_KEY
```

Or if you've installed the package in a specific directory or are developing on it:

```
cd path/to/servers/src/zep
npx @modelcontextprotocol/inspector uv run mcp-server-zep --api-key YOUR_API_KEY
```


Upon launching, the Inspector will display a URL that you can access in your browser to begin debugging.

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.