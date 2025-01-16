# Tavily Search MCP Server

An MCP server implementation that integrates the Tavily Search API, providing optimized search capabilities for LLMs.

## Features

-   **Web Search:** Perform web searches optimized for LLMs, with control over search depth, topic, and time range.
-   **Content Extraction:**  Extracts the most relevant content from search results, optimizing for quality and size.
-   **Optional Features:** Include images, image descriptions, short LLM-generated answers, and raw HTML content.
-   **Domain Filtering:**  Include or exclude specific domains in search results.

## Tools

-   **tavily_search**
    -   Execute web searches using the Tavily Search API.
    -   Inputs:
        -   `query` (string, required): The search query.
        -   `search_depth` (string, optional): "basic" or "advanced" (default: "basic").
        -   `topic` (string, optional): "general" or "news" (default: "general").
        -   `days` (number, optional): Number of days back for news search (default: 3).
        -   `time_range` (string, optional): Time range filter ("day", "week", "month", "year" or "d", "w", "m", "y").
        -   `max_results` (number, optional): Maximum number of results (default: 5).
        -   `include_images` (boolean, optional): Include related images (default: false).
        -   `include_image_descriptions` (boolean, optional): Include descriptions for images (default: false).
        -   `include_answer` (boolean, optional): Include a short LLM-generated answer (default: false).
        -   `include_raw_content` (boolean, optional): Include raw HTML content (default: false).
        -   `include_domains` (string[], optional): Domains to include.
        -   `exclude_domains` (string[], optional): Domains to exclude.

## Configuration

### Getting an API Key

1. Sign up for a [Tavily API account](https://tavily.com/).
2. Choose a plan (Free tier available).
3. Generate your API key from the Tavily dashboard.

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

#### Docker

```json
{
  "mcpServers": {
    "tavily-search": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "TAVILY_API_KEY",
        "mcp/tavily-search"
      ],
      "env": {
        "TAVILY_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "tavily-search": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-tavily-search"
      ],
      "env": {
        "TAVILY_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

## Build

Docker build:

```bash
docker build -t mcp/tavily-search:latest -f src/tavily-search/Dockerfile .
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
