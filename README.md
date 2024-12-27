# Azure MCP Server

MCP Server for the Azure DevOps API, enabling project management, repository operations, and more.

## About 
This MCP server provides integration with Azure DevOps services through a Model Context Protocol interface. It allows language models to interact with Azure DevOps features including:
- Project management operations
- Repository operations 
- Work item tracking
- Build and release pipelines
- And more

## Installation

You can install the server using npm:

```bash
npm install azure-mcp-server
```

## Using with MCP Client

Add this to your MCP client configuration (e.g. Claude Desktop):

```json
{
  "mcpServers": {
    "azure": {
      "command": "npx",
      "args": ["-y", "azure-mcp-server"],
      "env": {
        "AZURE_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
      }
    }
  }
}
```

For reference, here are additional examples of configuring other MCP servers:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx", 
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
    },
    "git": {
      "command": "uvx",
      "args": ["mcp-server-git", "--repository", "path/to/git/repo"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    }
  }
}
```

## Author
- **Zubeid Hendricks**
  - GitHub: @ZubeidHendricks
  - Contact: zubeid.hendricks@gmail.com