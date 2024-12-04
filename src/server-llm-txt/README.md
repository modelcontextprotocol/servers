# LLM.txt MCP Server

This is a Model Context Protocol (MCP) server that provides access to LLM.txt files from the [LLM.txt Directory](https://directory.llmstxt.cloud/). It supports listing available files, fetching content, and searching within files.

## Features

- Directory listing with local caching (24-hour cache)
- OS-specific cache locations:
  - Windows: `%LOCALAPPDATA%\llm-txt-mcp`
  - macOS: `~/Library/Caches/llm-txt-mcp`
  - Linux: `~/.cache/llm-txt-mcp`
- Multi-query search with context

## Installation

### Recommended: Using MCP Get

The easiest way to install is using MCP Get, which will automatically configure the server in Claude Desktop:

```bash
npx @michaellatman/mcp-get@latest install @modelcontextprotocol/server-llm-txt
```

### Manual Configuration

Alternatively, you can manually configure the server in your Claude Desktop configuration by adding this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "llm-txt": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-llm-txt"
      ]
    }
  }
}
```

## Tools

### 1. list_llm_txt

Lists all available LLM.txt files from the directory. Results are cached locally for 24 hours.

Example response:

```json
[
  {
    "id": 1,
    "url": "https://docs.squared.ai/llms.txt",
    "name": "AI Squared",
    "description": "AI Squared provides a data and AI integration platform that helps make intelligent insights accessible to all."
  }
]
```

### 2. get_llm_txt

Fetches content from an LLM.txt file by ID (obtained from list_llm_txt).

Parameters:
- `id`: The numeric ID of the LLM.txt file

Example response:

```json
{
  "id": 1,
  "url": "https://docs.squared.ai/llms.txt",
  "name": "AI Squared",
  "description": "AI Squared provides a data and AI integration platform that helps make intelligent insights accessible to all.",
  "content": "# AI Squared\n\n## Docs\n\n- [Create Catalog](https://docs.squared.ai/api-reference/catalogs/create_catalog)\n- [Update Catalog](https://docs.squared.ai/api-reference/catalogs/update_catalog)\n..."
}
```

### 3. search_llm_txt

Search for multiple substrings within an LLM.txt file.

Parameters:
- `id`: The numeric ID of the LLM.txt file
- `queries`: Array of strings to search for (case-insensitive)
- `context_lines` (optional): Number of lines to show before and after matches (default: 2)

Example response:

```json
{
  "id": 1,
  "url": "https://docs.squared.ai/llms.txt",
  "name": "AI Squared",
  "matches": [
    {
      "lineNumber": 42,
      "snippet": "- [PostgreSQL](https://docs.squared.ai/guides/data-integration/destinations/database/postgresql): PostgreSQL\n popularly known as Postgres, is a powerful, open-source object-relational database system that uses and extends the SQL language combined with many features that safely store and scale data workloads.\n- [null](https://docs.squared.ai/guides/data-integration/destinations/e-commerce/facebook-product-catalog)",
      "matchedLine": "- [PostgreSQL](https://docs.squared.ai/guides/data-integration/destinations/database/postgresql): PostgreSQL\n popularly known as Postgres, is a powerful, open-source object-relational database system that uses and extends the SQL language combined with many features that safely store and scale data workloads.",
      "matchedQueries": ["postgresql", "database"]
    }
  ]
}
```

## FAQ

### Why do the tools use numeric IDs instead of string identifiers?

While the examples above show string IDs for clarity, the actual implementation uses numeric IDs. We found that when using string IDs (like domain names or slugs), language models were more likely to hallucinate plausible-looking but non-existent LLM.txt files. Using opaque numeric IDs encourages models to actually check the list of available files first rather than guessing at possible IDs.

## Development

To run in development mode with automatic recompilation:

```bash
npm install
npm run watch
```

## License

MIT