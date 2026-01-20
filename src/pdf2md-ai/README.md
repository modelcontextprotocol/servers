# PDF to Markdown (pdf2md-ai)

AI-powered PDF to Markdown converter using advanced AI. Preserves document structure, tables, and formatting with intelligent content extraction.

## Features

- **Intelligent Extraction**: Uses advanced AI (Gemini) for accurate content extraction
- **Structure Preservation**: Maintains headings, tables, lists, and formatting
- **Multi-language Support**: Processes documents in any language
- **Credit-based System**: Transparent usage tracking
- **Fast Processing**: Typical 1-page PDF converted in seconds

## Installation

### Via NPX (Recommended)

Add to your MCP settings file:

#### Claude Desktop

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pdf2md-ai": {
      "command": "npx",
      "args": ["-y", "pdf2md-ai"],
      "env": {
        "PDF_TO_MARKDOWN_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

#### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "pdf2md-ai": {
      "command": "npx",
      "args": ["-y", "pdf2md-ai"],
      "env": {
        "PDF_TO_MARKDOWN_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Getting an API Key

1. Visit [pdf-to-markdown-pro.onrender.com](https://pdf-to-markdown-pro.onrender.com)
2. Sign up for a free account
3. Copy your API key from the dashboard
4. Add it to your MCP configuration as shown above

## Usage

Once configured, simply ask your AI assistant:

```
Convert this PDF to markdown: /path/to/your/document.pdf
```

The server will:
1. Read the PDF file from your local system
2. Process it using advanced AI
3. Return formatted Markdown with statistics

### Example

**Request:**
```
Convert this contract: C:\Documents\agreement.pdf
```

**Response:**
```
✅ Conversion Completed Successfully

📊 Statistics:
- Pages processed: 8
- Credits used: 8
- Credits remaining: 492

## Contract Content:

[Full markdown content here with preserved structure, tables, and formatting...]
```

## Tools

### convert_pdf_to_markdown

Converts a PDF file to Markdown format.

**Arguments:**
- `filePath` (string, required): Absolute path to the PDF file on your local system

**Returns:**
- Markdown-formatted content
- Document statistics (pages, file size)
- Credit usage information

## Configuration

### Environment Variables

- `PDF_TO_MARKDOWN_API_KEY` (required): Your API key from the service
- `PDF_API_URL` (optional): Custom API endpoint (defaults to production)

## Use Cases

- **Document Analysis**: Extract text from contracts, reports, invoices
- **RAG Pipelines**: Convert PDFs to Markdown for vector databases and embeddings
- **Content Migration**: Batch convert PDF documentation to Markdown format
- **Research**: Extract academic papers and technical documents
- **Data Extraction**: Pull structured data from forms and tables
- **Archiving**: Create searchable text versions of PDF archives

## Requirements

- Node.js 18 or higher
- Internet connection for API access
- Valid API key with available credits

## Limitations

- Maximum file size: 50 MB recommended
- Request timeout: 5 minutes per file
- Credit-based: Each page consumes 1 credit
- Requires network access to processing API

## Pricing

- Free tier available with limited credits
- Pay-as-you-go model: 1 credit per page
- Enterprise plans available for high-volume usage

Visit [pdf-to-markdown-pro.onrender.com](https://pdf-to-markdown-pro.onrender.com) for current pricing.

## Links

- [NPM Package](https://www.npmjs.com/package/pdf2md-ai)
- [Get API Key](https://pdf-to-markdown-pro.onrender.com)
- [GitHub Issues](https://github.com/MANUJ243/pdf2md-ai/issues)

## License

MIT
