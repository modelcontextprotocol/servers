# MCP Servers Installation Guide

This guide provides standardized installation instructions for all MCP servers in this repository.

## Quick Reference

| Server | Type | Primary Install |
|--------|------|-----------------|
| everything | TypeScript | `npx -y @modelcontextprotocol/server-everything` |
| fetch | Python | `uvx mcp-server-fetch` |
| filesystem | TypeScript | `npx -y @modelcontextprotocol/server-filesystem` |
| git | Python | `uvx mcp-server-git` |
| memory | TypeScript | `npx -y @modelcontextprotocol/server-memory` |
| sequentialthinking | TypeScript | `npx -y @modelcontextprotocol/server-sequential-thinking` |
| time | Python | `uvx mcp-server-time` |

## Installation Methods

### TypeScript Servers (NPX)

No installation required. Use `npx` to run directly:

```bash
npx -y @modelcontextprotocol/server-<name>
```

### Python Servers (uvx/pip)

**Option 1: uvx (Recommended)**

No installation required:

```bash
uvx mcp-server-<name>
```

**Option 2: pip**

```bash
pip install mcp-server-<name>
python -m mcp_server_<name>
```

## Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**TypeScript servers:**

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-<name>"]
    }
  }
}
```

**Python servers:**

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "uvx",
      "args": ["mcp-server-<name>"]
    }
  }
}
```

### VS Code

**One-click install:** Use the install buttons in each server's README.

**Manual - User Settings:**

1. Open User Settings (JSON) via Command Palette
2. Add the `mcp.servers` configuration

**Manual - Workspace Configuration:**

Create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "<server-name>": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-<name>"]
    }
  }
}
```

For more details, see the [VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/chat/mcp-servers).

### Zed

Add to Zed settings (`~/.config/zed/settings.json`):

```json
{
  "context_servers": {
    "<server-name>": {
      "command": {
        "path": "uvx",
        "args": ["mcp-server-<name>"]
      }
    }
  }
}
```

### Zencoder

1. Open the Zencoder menu (...)
2. Select **Agent Tools**
3. Click **Add Custom MCP**
4. Add your server configuration and click **Install**

## Docker

All servers support Docker installation. See individual server READMEs for specific mount requirements and build instructions.

General pattern for Claude Desktop:

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "mcp/<server-name>"]
    }
  }
}
```

## Debugging

Use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to debug server connections:

```bash
# For Python servers (uvx)
npx @modelcontextprotocol/inspector uvx mcp-server-<name>

# For TypeScript servers (npx)
npx @modelcontextprotocol/inspector npx -y @modelcontextprotocol/server-<name>
```

## Server-Specific Configuration

Each server may have additional configuration options. See the individual server README for:

- Required arguments (e.g., repository paths, allowed directories)
- Environment variables
- Docker volume mounts
- Server-specific features and tools
