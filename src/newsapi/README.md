# News API MCP Server

MCP Server for the News API, enabling Claude to search and retrieve news articles.

## Tools

1. `news_search`
   - Search for news articles by keywords, date range, and other filters
   - Required inputs:
     - `query` (string): Keywords or phrases to search for in the article title and body
   - Optional inputs:
     - `from` (string): The oldest article allowed (format: YYYY-MM-DD)
     - `to` (string): The newest article allowed (format: YYYY-MM-DD)
     - `language` (string): The 2-letter ISO-639-1 code of the language (e.g., en, es, fr)
     - `sortBy` (string): Sort order: relevancy, popularity, publishedAt
     - `pageSize` (number, default: 20, max: 100): Number of results to return per page
     - `page` (number, default: 1): Page number for paginated results
   - Returns: List of news articles matching the query

2. `news_top_headlines`
   - Get top headlines by country, category, or sources
   - Optional inputs (at least one required):
     - `country` (string): The 2-letter ISO 3166-1 code of the country (e.g., us, gb, jp)
     - `category` (string): News category (business, entertainment, general, health, science, sports, technology)
     - `sources` (string): Comma-separated string of news source IDs
     - `pageSize` (number, default: 20, max: 100): Number of results to return per page
     - `page` (number, default: 1): Page number for paginated results
   - Returns: List of top headlines

3. `news_sources`
   - Get news sources available in the News API
   - Optional inputs:
     - `category` (string): News category to filter sources by
     - `language` (string): The 2-letter ISO-639-1 code of the language
     - `country` (string): The 2-letter ISO 3166-1 code of the country
   - Returns: List of news sources matching the filters

## Setup

1. Get a News API key:
   - Visit [NewsAPI.org](https://newsapi.org/) and sign up for an account
   - Obtain your API key

### Usage with Claude Desktop

Add the following to your `claude_desktop_config.json`:

#### npx

```json
{
  "mcpServers": {
    "newsapi": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-newsapi"
      ],
      "env": {
        "NEWS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

#### docker

```json
{
  "mcpServers": {
    "newsapi": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "NEWS_API_KEY",
        "mcp/newsapi"
      ],
      "env": {
        "NEWS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Environment Variables

1. `NEWS_API_KEY`: Required. Your News API key.

### Troubleshooting

If you encounter errors, verify that:
1. Your News API key is valid and correctly set in the environment variables
2. You're within the News API usage limits (especially for free tier accounts)
3. Your system has a working internet connection

## Build

Docker build:

```bash
docker build -t mcp/newsapi -f Dockerfile .
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License.