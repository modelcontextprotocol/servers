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

## 📝 Usage Examples

```javascript
// Dynamic imports
const fs = await import('fs/promises');
const path = await import('path');

// Reading files
const content = await fs.readFile('package.json', 'utf8');
console.log(JSON.parse(content));

// Using path utilities
console.log(path.join('folder', 'file.txt'));
```

