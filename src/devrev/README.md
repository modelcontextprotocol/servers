# devrev MCP server

A MCP server project

## Quickstart

### Install

#### Claude Desktop

On MacOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`

On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

<details>
  <summary>Development/Unpublished Servers Configuration</summary>

  ```
  "mcpServers": {
    "devrev": {
      "command": "uv",
      "args": [
        "--directory",
        "Path to src/devrev directory",
        "run"
        "devrev"
      ],
      "env": {
        "DEVREV_API_KEY": "Your DevRev API key"
      }
    }
  }
  ```

</details>
