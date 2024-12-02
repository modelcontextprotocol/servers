# FireCrawl MCP Server

An MCP server implementation that integrates the FireCrawl API, providing advanced web scraping, crawling, and content extraction capabilities.

## Features

- **Advanced Web Scraping**: Extract content with JavaScript rendering support
- **Batch Processing**: Process multiple URLs asynchronously
- **Flexible Output**: Support for markdown, HTML, raw HTML, screenshots
- **Custom Actions**: Execute clicks, scrolls, and custom JavaScript before scraping
- **Smart Extraction**: Filter main content, exclude/include specific HTML tags
- **Structured Data**: Extract data using custom schemas and prompts

## Tools

### `fire_crawl_scrape`
- Execute single page scraping with advanced options
- **Inputs:**
  ```typescript
  {
    url: string;              // URL to scrape
    formats?: string[];       // ["markdown", "html", "rawHtml", "screenshot", "links"]
    onlyMainContent?: boolean;// Extract main content only
    includeTags?: string[];   // HTML tags to include
    excludeTags?: string[];   // HTML tags to exclude
    waitFor?: number;         // Wait time in ms
    actions?: Action[];       // Pre-scrape actions
    mobile?: boolean;         // Use mobile viewport
  }
  ```

### `fire_crawl_batch_scrape`
- Batch scrape multiple URLs asynchronously
- **Inputs:**
  ```typescript
  {
    urls: string[];          // Array of URLs to scrape
    options?: {
      formats?: string[];    // Output formats
      onlyMainContent?: boolean;
      includeTags?: string[];
      excludeTags?: string[];
      waitFor?: number;
    }
  }
  ```

### `fire_crawl_map`
- Discover URLs from a starting point
- **Inputs:**
  ```typescript
  {
    url: string;             // Starting URL
    search?: string;         // Filter URLs by search term
    ignoreSitemap?: boolean; // Skip sitemap.xml
    sitemapOnly?: boolean;   // Only use sitemap
    includeSubdomains?: boolean;
    limit?: number;          // Max URLs to return
  }
  ```

### `fire_crawl_crawl`
- Start an asynchronous crawl operation
- **Inputs:**
  ```typescript
  {
    url: string;             // Starting URL
    excludePaths?: string[]; // Paths to exclude
    includePaths?: string[]; // Paths to include
    maxDepth?: number;       // Maximum link depth
    limit?: number;          // Maximum pages
    allowExternalLinks?: boolean;
    deduplicateSimilarURLs?: boolean;
    scrapeOptions?: {        // Options for each page
      formats?: string[];
      onlyMainContent?: boolean;
      includeTags?: string[];
      excludeTags?: string[];
      waitFor?: number;
    }
  }
  ```

### Status Check Tools
- `fire_crawl_check_batch_status`: Check batch job status
- `fire_crawl_check_crawl_status`: Check crawl job status
- **Inputs:**
  ```typescript
  {
    id: string;              // Job ID to check
  }
  ```

## Configuration

### Getting an API Key
1. Sign up for a FireCrawl account
2. Get your API key from the dashboard
3. Set the environment variable:
```bash
FIRE_CRAWL_API_KEY=your_api_key
```

### Usage with Claude Desktop
Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fire-crawl": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-fire-crawl"
      ],
      "env": {
        "FIRE_CRAWL_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

## License

MIT License - see [LICENSE](LICENSE) for details 