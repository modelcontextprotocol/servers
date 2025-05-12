# mcp-server-sentry: A Sentry MCP server

## Overview

A Model Context Protocol server for retrieving and analyzing issues from Sentry.io. This server provides tools to inspect error reports, stacktraces, and other debugging information from your Sentry account.

### Tools

1. `get_sentry_issue`
   - Retrieve and analyze a Sentry issue by ID or URL
   - Input:
     - `issue_id_or_url` (string): Sentry issue ID or URL to analyze
   - Returns: Issue details including:
     - Title
     - Issue ID
     - Status
     - Level
     - First seen timestamp
     - Last seen timestamp
     - Event count
     - Full stacktrace

### Prompts

1. `sentry-issue`
   - Retrieve issue details from Sentry
   - Input:
     - `issue_id_or_url` (string): Sentry issue ID or URL
   - Returns: Formatted issue details as conversation context

## Installation

### Using uv (recommended)

When using [`uv`](https://docs.astral.sh/uv/) no specific installation is needed. We will
use [`uvx`](https://docs.astral.sh/uv/guides/tools/) to directly run *mcp-server-sentry*.

### Using PIP

Alternatively you can install `mcp-server-sentry` via pip:

```
pip install mcp-server-sentry
```

After installation, you can run it as a script using:

```
python -m mcp_server_sentry
```

## Configuration

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

<details>
<summary>Using uvx</summary>

```json
"mcpServers": {
  "sentry": {
    "command": "uvx",
    "args": ["mcp-server-sentry", "--auth-token", "YOUR_SENTRY_TOKEN"]
  }
}
```
</details>

<details>

<details>
<summary>Using docker</summary>

```json
"mcpServers": {
  "sentry": {
    "command": "docker",
    "args": ["run", "-i", "--rm", "mcp/sentry", "--auth-token", "YOUR_SENTRY_TOKEN"]
  }
}
```
</details>

<details>

<summary>Using pip installation</summary>

```json
"mcpServers": {
  "sentry": {
    "command": "python",
    "args": ["-m", "mcp_server_sentry", "--auth-token", "YOUR_SENTRY_TOKEN"]
  }
}
```
</details>

### Usage with VS Code

For quick installation, use one of the one-click installation buttons below...

[![Install with UV in VS Code](https://img.shields.io/badge/VS_Code-UV-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sentry&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22auth_token%22%2C%22description%22%3A%22Sentry%20Auth%20Token%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22uvx%22%2C%22args%22%3A%5B%22mcp-server-sentry%22%5D%2C%22env%22%3A%7B%22SENTRY_AUTH_TOKEN%22%3A%22%24%7Binput%3Aauth_token%7D%22%7D%7D) [![Install with UV in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-UV-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sentry&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22auth_token%22%2C%22description%22%3A%22Sentry%20Auth%20Token%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22uvx%22%2C%22args%22%3A%5B%22mcp-server-sentry%22%5D%2C%22env%22%3A%7B%22SENTRY_AUTH_TOKEN%22%3A%22%24%7Binput%3Aauth_token%7D%22%7D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sentry&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22auth_token%22%2C%22description%22%3A%22Sentry%20Auth%20Token%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Fsentry%22%5D%2C%22env%22%3A%7B%22SENTRY_AUTH_TOKEN%22%3A%22%24%7Binput%3Aauth_token%7D%22%7D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sentry&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22auth_token%22%2C%22description%22%3A%22Sentry%20Auth%20Token%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Fsentry%22%5D%2C%22env%22%3A%7B%22SENTRY_AUTH_TOKEN%22%3A%22%24%7Binput%3Aauth_token%7D%22%7D%7D&quality=insiders)

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> Note that the `mcp` key is needed when using the `mcp.json` file.

<details>
<summary>Using uvx</summary>

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "auth_token",
        "description": "Sentry Auth Token",
        "password": true
      }
    ],
    "servers": {
      "sentry": {
        "command": "uvx",
        "args": ["mcp-server-sentry"],
        "env": {
          "SENTRY_AUTH_TOKEN": "${input:auth_token}"
        }
      }
    }
  }
}
```
</details>

<details>
<summary>Using docker</summary>

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "auth_token",
        "description": "Sentry Auth Token",
        "password": true
      }
    ],
    "servers": {
      "sentry": {
        "command": "docker",
        "args": ["run", "-i", "--rm", "mcp/sentry"],
        "env": {
          "SENTRY_AUTH_TOKEN": "${input:auth_token}"
        }
      }
    }
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
  "mcp-server-sentry": {
    "command": {
      "path": "uvx",
      "args": ["mcp-server-sentry", "--auth-token", "YOUR_SENTRY_TOKEN"]
    }
  }
],
```
</details>

<details>
<summary>Using pip installation</summary>

```json
"context_servers": {
  "mcp-server-sentry": {
    "command": "python",
    "args": ["-m", "mcp_server_sentry", "--auth-token", "YOUR_SENTRY_TOKEN"]
  }
},
```
</details>

## Debugging

You can use the MCP inspector to debug the server. For uvx installations:

```
npx @modelcontextprotocol/inspector uvx mcp-server-sentry --auth-token YOUR_SENTRY_TOKEN
```

Or if you've installed the package in a specific directory or are developing on it:

```
cd path/to/servers/src/sentry
npx @modelcontextprotocol/inspector uv run mcp-server-sentry --auth-token YOUR_SENTRY_TOKEN
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
