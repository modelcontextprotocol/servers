# Office 365 MCP Server

Model Context Protocol server implementation for Microsoft Office 365, enabling AI language models to interact with Word, Excel, PowerPoint, and SharePoint.

## Features

### Word
- Document creation and editing
- Content management
- Document search

### Excel
- Workbook operations
- Worksheet data manipulation
- Table management

### PowerPoint
- Presentation creation
- Slide management
- Content and element manipulation

### SharePoint
- Site management
- List operations
- Content collaboration

## Installation

```bash
npm install @modelcontextprotocol/server-office365
```

## Configuration

Required environment variables:
```
AZURE_TENANT_ID=your_tenant_id
AZURE_CLIENT_ID=your_client_id
AZURE_CLIENT_SECRET=your_client_secret
```

## MCP Client Configuration

```json
{
  "mcpServers": {
    "office365": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-office365"],
      "env": {
        "AZURE_TENANT_ID": "<YOUR_TENANT_ID>",
        "AZURE_CLIENT_ID": "<YOUR_CLIENT_ID>",
        "AZURE_CLIENT_SECRET": "<YOUR_CLIENT_SECRET>"
      }
    }
  }
}
```

## Usage Examples

### Word Documents
```typescript
// Create document
const doc = await office365.word.createDocument({
  name: "Report.docx",
  content: "<h1>Project Report</h1>"
});

// Update content
await office365.word.updateDocument({
  id: doc.id,
  content: "<h1>Updated Report</h1>"
});
```

### Excel Operations
```typescript
// Create workbook
const workbook = await office365.excel.createWorkbook({
  name: "Data.xlsx"
});

// Update data
await office365.excel.updateWorksheetData({
  workbookId: workbook.id,
  worksheetName: "Sheet1",
  range: "A1:B2",
  values: [["Header1", "Header2"], [1, 2]]
});
```

### PowerPoint
```typescript
// Create presentation
const presentation = await office365.powerpoint.createPresentation({
  name: "Slides.pptx"
});

// Add slide
await office365.powerpoint.addSlide({
  presentationId: presentation.id
});
```

### SharePoint
```typescript
// Create site
const site = await office365.sharepoint.createSite({
  name: "Project Site",
  description: "Project collaboration space"
});

// Create list
await office365.sharepoint.createList({
  siteId: site.id,
  name: "Tasks",
  columns: [
    { name: "Title", type: "text" },
    { name: "DueDate", type: "dateTime" }
  ]
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
```

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License
MIT