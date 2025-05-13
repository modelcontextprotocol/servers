# Brave Search MCP Server

An MCP server implementation that integrates the Brave Search API, providing both web and local search capabilities.

## Features

- **Web Search**: General queries, news, articles, with pagination and freshness controls
- **Local Search**: Find businesses, restaurants, and services with detailed information
- **Flexible Filtering**: Control result types, safety levels, and content freshness
- **Smart Fallbacks**: Local search automatically falls back to web when no results are found

## Tools

- **brave_web_search**

  - Execute web searches with pagination and filtering
  - Inputs:
    - `query` (string): Search terms
    - `count` (number, optional): Results per page (max 20)
    - `offset` (number, optional): Pagination offset (max 9)
    - `goggles` (array of strings, optional): Apply custom re-ranking using Brave Goggles. Provide an array of Goggle URLs **or definitions**.
        - **Finding Goggles:** Discover pre-made Goggles for various topics at [https://search.brave.com/goggles/discover](https://search.brave.com/goggles/discover).
        - **Creating Goggles:** Learn how to create your own custom Goggles (hosted URL or definition) by following the guide at the [Brave Goggles Quickstart repository](https://github.com/brave/goggles-quickstart).
        - *Example (URL):* To use the Rust programming goggle, pass its URL: `["https://raw.githubusercontent.com/brave/goggles-quickstart/main/goggles/rust_programming.goggle"]`.
        - *Example (Definition):* You could also pass the raw goggle definition string directly in the array.
        - **Note:** Default goggles (URLs or definitions) can also be set server-wide using the `BRAVE_GOGGLES` environment variable (see Configuration below).

- **brave_local_search**
  - Search for local businesses and services
  - Inputs:
    - `query` (string): Local search terms
    - `count` (number, optional): Number of results (max 20)
  - Automatically falls back to web search if no local results found

## Configuration

### Getting an API Key

1. Sign up for a [Brave Search API account](https://brave.com/search/api/)
2. Choose a plan (Free tier available with 2,000 queries/month)
3. Generate your API key [from the developer dashboard](https://api-dashboard.search.brave.com/app/keys)

### Setting Environment Variables

- `BRAVE_API_KEY` (Required): Your Brave Search API key.
- `BRAVE_GOGGLES` (Optional): A **JSON string array** containing Goggle URLs or definitions to apply by default to all `brave_web_search` requests. Goggles specified in the tool call arguments will be added to these defaults.
  *Example (URL):* `export BRAVE_GOGGLES='["https://raw.githubusercontent.com/brave/goggles-quickstart/main/goggles/rust_programming.goggle"]'`
  *Example (Mix):* `export BRAVE_GOGGLES='["https://raw.githubusercontent.com/brave/goggles-quickstart/main/goggles/rust_programming.goggle", "https://raw.githubusercontent.com/andresnowak/js_programming_goggle/main/javascript.goggle", "[!boost:5] $site=javascript.info [!boost:5] $site=react.dev"]'`

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

### Docker

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "BRAVE_API_KEY",
        "-e",
        "BRAVE_GOGGLES",
        "mcp/brave-search"
      ],
      "env": {
        "BRAVE_API_KEY": "YOUR_API_KEY_HERE",
        "BRAVE_GOGGLES": "[\"YOUR_DEFAULT_GOGGLE_URL_OR_DEFINITION\"]"
      }
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-brave-search"
      ],
      "env": {
        "BRAVE_API_KEY": "YOUR_API_KEY_HERE",
        "BRAVE_GOGGLES": "[\"YOUR_DEFAULT_GOGGLE_URL_OR_DEFINITION\"]"
      }
    }
  }
}
```

### Usage with VS Code

For quick installation, use the one-click installation buttons below...

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=brave&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22apiKey%22%2C%22description%22%3A%22Brave%20Search%20API%20Key%22%2C%22password%22%3Atrue%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22goggles%22%2C%22description%22%3A%22Optional%3A%20Enter%20your%20default%20Goggle%20URLs%2FDefinitions%22%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-brave-search%22%5D%2C%22env%22%3A%7B%22BRAVE_API_KEY%22%3A%22%24%7Binput%3Abrave_apiKey%7D%22%2C%22BRAVE_GOGGLES%22%3A%22%24%7Binput%3Abrave_goggles%7D%22%7D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=brave&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22apiKey%22%2C%22description%22%3A%22Brave%20Search%20API%20Key%22%2C%22password%22%3Atrue%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22goggles%22%2C%22description%22%3A%22Optional%3A%20Enter%20your%20default%20Goggle%20URLs%2FDefinitions%22%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-brave-search%22%5D%2C%22env%22%3A%7B%22BRAVE_API_KEY%22%3A%22%24%7Binput%3Abrave_apiKey%7D%22%2C%22BRAVE_GOGGLES%22%3A%22%24%7Binput%3Abrave_goggles%7D%22%7D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=brave&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22apiKey%22%2C%22description%22%3A%22Brave%20Search%20API%20Key%22%2C%22password%22%3Atrue%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22goggles%22%2C%22description%22%3A%22Optional%3A%20Enter%20your%20default%20Goggle%20URLs%2FDefinitions%22%7D%5D&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22-e%22%2C%22BRAVE_API_KEY%22%2C%22-e%22%2C%22BRAVE_GOGGLES%22%2C%22mcp%2Fbrave-search%22%5D%2C%22env%22%3A%7B%22BRAVE_API_KEY%22%3A%22%24%7Binput%3Abrave_apiKey%7D%22%2C%22BRAVE_GOGGLES%22%3A%22%24%7Binput%3Abrave_goggles%7D%22%7D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=brave&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22apiKey%22%2C%22description%22%3A%22Brave%20Search%20API%20Key%22%2C%22password%22%3Atrue%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22goggles%22%2C%22description%22%3A%22Optional%3A%20Enter%20your%20default%20Goggle%20URLs%2FDefinitions%22%7D%5D&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22-e%22%2C%22BRAVE_API_KEY%22%2C%22-e%22%2C%22BRAVE_GOGGLES%22%2C%22mcp%2Fbrave-search%22%5D%2C%22env%22%3A%7B%22BRAVE_API_KEY%22%3A%22%24%7Binput%3Abrave_apiKey%7D%22%2C%22BRAVE_GOGGLES%22%3A%22%24%7Binput%3Abrave_goggles%7D%22%7D%7D&quality=insiders)

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open User Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> Note that the `mcp` key is not needed in the `.vscode/mcp.json` file.

#### Docker

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "brave_api_key",
        "description": "Brave Search API Key",
        "password": true
      },
      {
        "type": "promptString",
        "id": "brave_goggles",
        "description": "Optional: Enter your default Goggle URLs/Definitions"
      }
    ],
    "servers": {
      "brave-search": {
        "command": "docker",
        "args": [
          "run",
          "-i",
          "--rm",
          "-e",
          "BRAVE_API_KEY",
          "-e",
          "BRAVE_GOGGLES",
          "mcp/brave-search"
        ],
        "env": {
          "BRAVE_API_KEY": "${input:brave_api_key}",
          "BRAVE_GOGGLES": "${input:brave_goggles}"
        }
      }
    }
  }
}
```

#### NPX

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "brave_api_key",
        "description": "Brave Search API Key",
        "password": true
      },
      {
        "type": "promptString",
        "id": "brave_goggles",
        "description": "Optional: Enter your default Goggle URLs/Definitions"
      }
    ],
    "servers": {
      "brave-search": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-brave-search"],
        "env": {
          "BRAVE_API_KEY": "${input:brave_api_key}",
          "BRAVE_GOGGLES": "${input:brave_goggles}"
        }
      }
    }
  }
}
```

## Build

Docker build:

```bash
docker build -t mcp/brave-search:latest -f src/brave-search/Dockerfile .
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
