# Google Search MCP Server

A Model Context Protocol server that provides Google Search capabilities. This server enables LLMs to retrieve search results from Google using the Custom Search API.

### Available Tools

- `google_search` - Performs a Google search and returns a list of search results with titles, links, and snippets.
    - `query` (string, required): The search query.
    - `num` (integer, optional): Number of search results to return (default: varies, check Google API documentation).
    - `start` (integer, optional): The index of the first result to return (default: 1).
    - `gl` (string, optional): Geolocation of the search (e.g., "US").
    - `hl` (string, optional): Interface language (host language) (e.g., "en").
    - `cr` (string, optional): Country restrict to narrow search (e.g., "countryUS").
    - `dateRestrict` (string, optional): Restricts results to URLs based on date (e.g., "d5" for past 5 days).
    - `exactTerms` (string, optional): Identifies a phrase that all documents must contain.
    - `excludeTerms` (string, optional): Identifies a word or phrase that should not appear in any documents.
    - `fileType` (string, optional): Returns only results of specified filetype (e.g., "pdf").
    - `filter` (string, optional): Controls turning on or off the duplicate content filter ("0" or "1").
    - `googlehost` (string, optional): The Google domain to use to search (e.g., "google.com").
    - `highRange` (string, optional): Specifies the ending value for a range search.
    - `linkSite` (string, optional): Specifies that all search results should contain a link to a particular URL.
    - `lowRange` (string, optional): Specifies the starting value for a range search.
    - `lr` (string, optional): The language restriction for the search (e.g., "lang_en").
    - `orTerms` (string, optional): Provides additional search terms to check for in a document.
    - `relatedSite` (string, optional): Specifies that all search results should be pages that are related to the specified URL.
    - `safe` (string, optional): Search safety level ("active", "moderate", "off").
    - `siteSearch` (string, optional): Specifies a given site which should always be included or excluded from results.
    - `siteSearchFilter` (string, optional): Controls whether to include or exclude results from the site named in the siteSearch parameter ("e" for exclude, "i" for include).
    - `sort` (string, optional): The sort expression to use to sort the results.

### Prompts

- **google_search**
  - Performs a Google search and returns a list of search results.
  - Arguments:
    - `query` (string, required): The search query.

## Installation

### Using uv (recommended)

When using [`uv`](https://docs.astral.sh/uv/) no specific installation is needed. We will

## Configuration

Before running the server, you need to set up a Google Custom Search Engine and obtain an API key and CSE ID.

1.  **Enable the Custom Search API:**
    -   Go to the [Google Cloud Console](https://console.cloud.google.com/apis/library/customsearch.googleapis.com).
    -   Enable the Custom Search API.

2.  **Create an API key:**
    -   Go to the [Credentials page](https://console.cloud.google.com/apis/credentials).
    -   Create an API key.

3.  **Set up a Custom Search Engine:**
    -   Go to the [Programmable Search Engine](https://programmablesearchengine.google.com/controlpanel/all).
    -   Create a new search engine.  If you want to search the entire web, select the "Search the entire web" option.
    -   Obtain the Search engine ID.

4.  **Set environment variables:**
    -   Set the `GOOGLE_API_KEY` and `GOOGLE_CSE_ID` environment variables with the values you obtained in the previous steps.  You can do this in a `.env` file in the project directory.

### Configure for Claude.app

Add to your Claude settings:

<details>
<summary>Using uv</summary>

```json
"mcpServers": {
  "google_search": {
    "command": "uv",
    "args": ["run", "mcp-server-googlesearch"]
  }
}
```
</details>

<details>
<summary>Using docker</summary>

```json
"mcpServers": {
  "google_search": {
    "command": "docker",
    "args": ["run", "-i", "--rm", "mcp-server-googlesearch:dev"]
  }
}
```
</details>

<details>
<summary>Using pip installation</summary>

```json
"mcpServers": {
  "google_search": {
    "command": "python",
    "args": ["-m", "mcp_server_googlesearch"]
  }
}
```
</details>

## Debugging

You can use the MCP inspector to debug the server. For uv installations:

```
npx @modelcontextprotocol/inspector uv run mcp-server-googlesearch
```

Or if you've installed the package in a specific directory or are developing on it:

```
cd path/to/servers/src/google-search
npx @modelcontextprotocol/inspector uv run mcp-server-googlesearch
```

## Contributing

We encourage contributions to help expand and improve mcp-server-googlesearch. Whether you want to add new tools, enhance existing functionality, or improve documentation, your input is valuable.

For examples of other MCP servers and implementation patterns, see:
https://github.com/modelcontextprotocol/servers

Pull requests are welcome! Feel free to contribute new ideas, bug fixes, or enhancements to make mcp-server-googlesearch even more powerful and useful.

## License

mcp-server-googlesearch is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
