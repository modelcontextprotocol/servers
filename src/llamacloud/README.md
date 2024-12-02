# LlamaCloud MCP Server

A MCP server connecting to a managed index on [LlamaCloud](https://cloud.llamaindex.ai/)

This is a TypeScript-based MCP server that implements a connection to a managed index on LlamaCloud.

## Features

### Tools
- `get_information` - Get information from your knowledge base to answer questions.
  - Takes query as required parameters

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

## Installation

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "llamacloud": {
      "command": "node",
      "args": [
        "/path/to/llamacloud/dist/index.js",
      ],
      "env": {
        "LLAMA_CLOUD_INDEX_NAME": "<YOUR_INDEX_NAME>",
        "LLAMA_CLOUD_PROJECT_NAME": "<YOUR_PROJECT_NAME>",
        "LLAMA_CLOUD_API_KEY": "<YOUR_API_KEY>"
      }
    }
  }
}
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.
