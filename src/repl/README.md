# 🚀 Node.js REPL Executor

A Node.js execution environment

## 🧩 Configuration

For Cursor, update your `.cursor/mcp.json` configuration:

```json
{
  "mcpServers": {
    "mcp-repl": {
      "command": "npx",
      "args": [
        "mcp-repl", "path/to/your/project"
      ],
      "env": {},
      "disabled": false,
      "autoApprove": ["execute"]
    }
  }
}
```

## 🛠️ Implementation Details

This implementation:

1. Runs the code directly with Node.js in a separate process
2. Captures all console output and execution results
3. Returns standardized results to the MCP client
