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
3. Generate your API key [from the developer dashboard](https://api.search.brave.com/app/keys)

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
        "mcp/brave-search"
      ],
      "env": {
        "BRAVE_API_KEY": "YOUR_API_KEY_HERE"
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
        "BRAVE_API_KEY": "YOUR_API_KEY_HERE"
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
