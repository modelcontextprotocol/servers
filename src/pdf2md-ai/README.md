# PDF to Markdown (pdf2md-ai)

AI-powered PDF to Markdown converter that **preserves complete context**: images (analyzed and described with AI), complex tables (including merged cells), code blocks (with original formatting), and document structure. Uses Gemini and LlamaParse for intelligent processing.

## Key Features

This is not just a simple PDF text extractor. pdf2md-ai **preserves complete visual and structural context**:

- 📸 **Images with Context**: Each image is analyzed with AI (Gemini) and described in detail, maintaining its context within the document
- 📊 **Complex Tables**: Preserves complete table structure including merged cells, alignment, and formatting
- 💻 **Source Code**: Maintains code blocks with original syntax and formatting intact
- 📝 **Document Structure**: Hierarchies, lists, quotes, and special formatting preserved
- 🌍 **Multi-language Support**: Processes documents in any language
- ⚡ **Fast Processing**: Typical 1-page PDF converted in seconds
- 💳 **Credit-based System**: Transparent usage tracking (1 credit per page)

This means when you convert a technical PDF, a report with graphics, or documentation with code examples, **you don't lose any visual or structural information**.

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
2. Analyze images with AI and extract descriptions
3. Preserve complete table structures
4. Maintain code blocks with original formatting
5. Return formatted Markdown with full context preserved

### Example

**Request:**
```
Convert this technical document: C:\Documents\api-guide.pdf
```

**Response:**
```
✅ Conversion Completed Successfully

📊 Statistics:
- Pages processed: 8
- Credits used: 8
- Credits remaining: 492

## API Guide Content:

[Full markdown content here with:
 - Image descriptions in context
 - Complex tables fully preserved
 - Code examples with syntax highlighting
 - Complete document structure maintained...]
```

## Tools

### convert_pdf_to_markdown

Converts a PDF file to Markdown format preserving complete context: images, tables, code blocks, and structure.

**Arguments:**
- `filePath` (string, required): Absolute path to the PDF file on your local system

**Returns:**
- Markdown-formatted content with complete context preservation
- Document statistics (pages, file size)
- Credit usage information

## Configuration

### Environment Variables

- `PDF_TO_MARKDOWN_API_KEY` (required): Your API key from the service
- `PDF_API_URL` (optional): Custom API endpoint (defaults to production)

## Use Cases

- **Technical Documentation**: Convert docs with diagrams, tables, and code while preserving all context
- **Research Papers**: Extract academic papers with figures, complex tables, and references
- **RAG Pipelines**: Create context-rich markdown for vector databases and embeddings
- **Contract Analysis**: Process legal documents with tables and structured information
- **Data Extraction**: Pull structured data from forms and complex tables
- **Code Documentation**: Extract programming guides with code examples intact
- **Report Processing**: Convert business reports maintaining charts and table context

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
