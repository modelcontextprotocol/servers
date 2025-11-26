# MCP Configuration Examples

This document provides configuration examples for various MCP clients to use the AI Group Markdown to Word Converter.

## Claude Desktop Configuration

Add the following to your Claude Desktop configuration file (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "aigroup-mdtoword": {
      "command": "npx",
      "args": ["-y", "aigroup-mdtoword-mcp"]
    }
  }
}
```

Or for development/local installation:

```json
{
  "mcpServers": {
    "aigroup-mdtoword": {
      "command": "node",
      "args": ["/path/to/aigroup-mdtoword-mcp/dist/index.js"]
    }
  }
}
```

## Cursor Configuration

Add to your Cursor MCP configuration:

```json
{
  "mcpServers": {
    "aigroup-mdtoword": {
      "command": "npx",
      "args": ["-y", "aigroup-mdtoword-mcp"]
    }
  }
}
```

## Windsurf Configuration

Add to your Windsurf configuration:

```json
{
  "mcpServers": {
    "aigroup-mdtoword": {
      "command": "npx",
      "args": ["-y", "aigroup-mdtoword-mcp"]
    }
  }
}
```

## Cline Configuration

Add to your Cline configuration:

```json
{
  "mcpServers": {
    "aigroup-mdtoword": {
      "command": "npx",
      "args": ["-y", "aigroup-mdtoword-mcp"]
    }
  }
}
```

## HTTP Server Configuration

For HTTP transport, you can run the server separately:

```bash
# Start HTTP server
npm run server:http
```

Then configure your MCP client to connect via HTTP:

```json
{
  "mcpServers": {
    "aigroup-mdtoword": {
      "url": "http://localhost:3000"
    }
  }
}
```

## Environment Variables

The server supports the following environment variables:

```bash
# Port for HTTP server (default: 3000)
MCP_HTTP_PORT=3000

# Log level (default: info)
MCP_LOG_LEVEL=debug

# Template directory (default: ./examples/templates)
MCP_TEMPLATE_DIR=./templates

# Image directory (default: ./charts)
MCP_IMAGE_DIR=./images
```

## Development Configuration

For development and testing:

```json
{
  "mcpServers": {
    "aigroup-mdtoword-dev": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "/path/to/aigroup-mdtoword-mcp"
    }
  }
}
```

## Multiple Template Configuration

You can configure multiple template presets:

```json
{
  "mcpServers": {
    "aigroup-mdtoword": {
      "command": "npx",
      "args": [
        "-y", 
        "aigroup-mdtoword-mcp",
        "--templates", "./custom-templates"
      ]
    }
  }
}
```

## Security Configuration

For production environments:

```json
{
  "mcpServers": {
    "aigroup-mdtoword": {
      "command": "npx",
      "args": ["-y", "aigroup-mdtoword-mcp"],
      "env": {
        "NODE_ENV": "production",
        "MCP_LOG_LEVEL": "warn"
      }
    }
  }
}
```

## Verification

After configuration, verify the server is working by asking your MCP client:

```
"Can you help me convert markdown to Word document?"
```

The server should respond with available tools and capabilities.

## Troubleshooting

If the server fails to start:

1. Check Node.js version (requires 18+)
2. Verify dependencies are installed: `npm install`
3. Check build status: `npm run build`
4. Verify the server starts: `npm start`

For HTTP transport issues:

1. Verify port 3000 is available
2. Check firewall settings
3. Verify the server is running: `curl http://localhost:3000/health`