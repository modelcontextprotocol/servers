# OneNote MCP Server

A Model Context Protocol (MCP) server implementation for Microsoft OneNote, enabling AI language models to interact with OneNote through a standardized interface.

## Features

### Notebook Management
- List all notebooks
- Create new notebooks
- Get notebook details
- Delete notebooks

### Section Management
- List sections in a notebook
- Create new sections
- Get section details
- Delete sections

### Page Management
- List pages in a section
- Create new pages with HTML content
- Read page content
- Update page content
- Delete pages
- Search pages across notebooks

## Installation

```bash
npm install @modelcontextprotocol/server-onenote
```

## Configuration

Set the following environment variables:
- `AZURE_TENANT_ID`: Your Azure tenant ID
- `AZURE_CLIENT_ID`: Your Azure application (client) ID
- `AZURE_CLIENT_SECRET`: Your Azure client secret

## Using with MCP Client

Add this to your MCP client configuration (e.g. Claude Desktop):

```json
{
  "mcpServers": {
    "onenote": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-onenote"],
      "env": {
        "AZURE_TENANT_ID": "<YOUR_TENANT_ID>",
        "AZURE_CLIENT_ID": "<YOUR_CLIENT_ID>",
        "AZURE_CLIENT_SECRET": "<YOUR_CLIENT_SECRET>"
      }
    }
  }
}
```

## Azure App Registration

1. Go to Azure Portal and navigate to App registrations
2. Create a new registration
3. Add Microsoft Graph API permissions:
   - Notes.ReadWrite.All
   - Notes.Read.All
4. Create a client secret
5. Copy the tenant ID, client ID, and client secret for configuration

## Examples

### Managing Notebooks
```typescript
// Create a notebook
const notebook = await onenote.notebooks.createNotebook({
  name: "My Notebook",
  sectionName: "First Section"
});

// List notebooks
const notebooks = await onenote.notebooks.listNotebooks();
```

### Managing Pages
```typescript
// Create a page
const page = await onenote.pages.createPage({
  title: "My Page",
  content: "<h1>Hello World</h1><p>This is a test page.</p>",
  sectionId: "section-id"
});

// Search pages
const searchResults = await onenote.pages.searchPages({
  query: "hello world",
  notebookId: "optional-notebook-id"
});
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Lint
npm run lint
```

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for information about contributing to this repository.

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.