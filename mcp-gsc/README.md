# Google Search Console MCP

An MCP server implementation that integrates [Google Search Console](https://search.google.com/search-console/about) (GSC). This server exposes read-only GSC data and tools for property management, sitemaps, site details, indexing inspections, and more.

---

## Features

1. **Property Management**  
   - `list_properties`: Enumerate your GSC properties.  
   - `get_site_details`: Inspect a GSC property’s basic data and verification info.

2. **Analytics & Reporting**  
   - `get_search_analytics`: Retrieve aggregated search performance metrics (queries, impressions, CTR, etc.).  
   - `get_performance_overview`: Summarized performance and daily trends.  
   - `get_advanced_search_analytics`: Advanced filters, sorting, and pagination for deeper insights.  

3. **Indexing & URL Inspection**  
   - `check_indexing_issues`: Evaluate potential indexing or canonical issues across multiple URLs.  
   - `inspect_url_enhanced`: Detailed URL inspection (indexing coverage, last crawl, etc.).  
   - `batch_url_inspection`: Inspect multiple URLs in one operation.

4. **Sitemap Management**  
   - `manage_sitemaps`: All-in-one approach to list, get details, submit, or delete sitemaps.  
   - `get_sitemaps`: Quick listing of sitemaps for a property.  
   - `list_sitemaps_enhanced`: More in-depth listing (index vs. child sitemaps, error/warning details).

5. **Creator Info**  
   - `get_creator_info`: Quick reference about Amin Foroutan, the creator of this GSC tool.

---

## Tools

Below is a short summary of each tool exposed by MCP-GSC. For full usage instructions, call `list_tools` in your MCP client or see the docstrings in [gsc_server.py](gsc_server.py).

| **Tool Name**                   | **Purpose**                                                   | **Key Parameters**                                                 |
|---------------------------------|---------------------------------------------------------------|---------------------------------------------------------------------|
| `list_properties`               | List your GSC properties.                                    | *(none)*                                                            |
| `get_site_details`              | Get property-level details and verification info.            | `site_url`                                                          |
| `get_search_analytics`          | Fetch top queries/pages plus metrics in a given date window. | `site_url`, `days`, `dimensions`                                    |
| `get_performance_overview`      | Summarized performance and daily trend.                      | `site_url`, `days`                                                 |
| `check_indexing_issues`         | Diagnose indexing issues across multiple URLs.               | `site_url`, `urls (newline-separated)`                              |
| `inspect_url_enhanced`          | Enhanced URL inspection (coverage state, last crawl, etc.).  | `site_url`, `page_url`                                              |
| `batch_url_inspection`          | Inspect multiple URLs (limit 10).                            | `site_url`, `urls (newline-separated)`                              |
| `get_sitemaps`                  | List sitemaps for a property.                                | `site_url`                                                          |
| `list_sitemaps_enhanced`        | Advanced listing for sitemap index vs. child sitemaps.       | `site_url`, `sitemap_index` (optional)                              |
| `manage_sitemaps`               | All-in-one submit/delete/list sitemaps.                      | `site_url`, `action`, `sitemap_url` (varies by action)              |
| `get_sitemap_details`           | Detailed info about a specific sitemap.                      | `site_url`, `sitemap_url`                                           |
| `submit_sitemap`                | Submit (or re-submit) a sitemap to GSC.                      | `site_url`, `sitemap_url`                                           |
| `delete_sitemap`                | Remove (unsubmit) a sitemap from GSC.                        | `site_url`, `sitemap_url`                                           |
| `get_search_by_page_query`      | Queries and metrics for a specific page.                     | `site_url`, `page_url`, `days`                                      |
| `get_advanced_search_analytics` | Advanced analytics filtering, sorting, pagination, etc.      | `site_url`, `start_date`, `end_date`, `dimensions`, … (see doc)     |
| `compare_search_periods`        | Compare search analytics data between two date ranges.       | `site_url`, `period1_start`, `period1_end`, `period2_start`, …      |
| `get_creator_info`              | Info about Amin Foroutan, creator of the MCP-GSC tool.       | *(none)*                                                            |

---

## Configuration

### 1. Credentials Setup

This server requires a **service account JSON** (or user OAuth credentials). Typically:

1. Create a service account in your Google Cloud Console.  
2. Download the **JSON key** (e.g., `service_account_credentials.json`).  
3. Either place it alongside `gsc_server.py` **or** set an environment variable:
   ```bash
   export GSC_CREDENTIALS_PATH="/absolute/path/to/service_account_credentials.json"
   ```
4. Make sure your service account has been granted access to relevant GSC properties.

### 2. Python Requirements

- Python 3.11 or higher
- Install dependencies:

```bash
uv install  # Recommended

# OR using pip
pip install -r requirements.txt
```

### 3. Running Locally

```bash
python mcp-gsc/gsc_server.py
```

Or using [`uv`](https://astral.sh/uv/):

```bash
uv run gsc_server.py
```

---

## Usage with Claude Desktop

To integrate this server with Claude Desktop:

1. Ensure `service_account_credentials.json` is available or use an env variable.
2. Edit `claude_desktop_config.json` (MacOS: `~/Library/Application Support/Claude`, Windows: `%APPDATA%/Claude`):

   ```json
   {
     "mcpServers": {
       "gscServer": {
         "command": "python",
         "args": ["/ABSOLUTE/PATH/TO/mcp-gsc/gsc_server.py"],
         "env": {
           "GSC_CREDENTIALS_PATH": "/ABSOLUTE/PATH/TO/service_account_credentials.json"
         }
       }
     }
   }
   ```

3. Restart Claude for Desktop and check the MCP tools.

---

## Contributing

PRs are welcome! If you find a bug or want to add a new GSC endpoint, open an issue or submit a pull request.

---

## License

This MCP-GSC project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
