# MCP Filesystem Server Tests

This directory contains test scripts for working with the Model Context Protocol
(MCP) filesystem server. These tests demonstrate how to interact with the server
to perform file operations, search for files, and search within file contents.

## Prerequisites

- Node.js v18.0.0 or higher
- TypeScript
- Access to the filesystem directories you want to work with

## Setup

1. Install dependencies:

```bash
npm install
```

2. Ensure test scripts have execution permissions:

```bash
chmod +x test.js comprehensive-test.js create-file-test.js
```

3. Build the server and tests:

```bash
npm run build
```

## Available Test Scripts

The package includes several test scripts:

- **Basic Test**: Simple directory listing test
- **Comprehensive Test**: Multiple file operations in sequence
- **Create File Test**: Test file creation operations
- **Search Test**: Search for files by name pattern
- **Content Search**: Search inside file contents for text patterns

## Running Tests

### Basic File System Test

Tests basic directory listing:

```bash
npm run test
```

### Comprehensive Test

Tests multiple operations in sequence:

```bash
npm run test:comprehensive
```

### File Creation Test

Tests creating files:

```bash
npm run test:create-file
```

### File Search

Search for files by name pattern:

```bash
# Search with default pattern "test"
npm run search

# Search with custom pattern
npm run search -- pdf
```

### Content Search

Search inside file contents for text patterns:

```bash
# Search with default pattern "function" in the current directory
npm run search:content

# Search with custom pattern
npm run search:content -- "import" .

# Search in a specific directory
npm run search:content -- "validatePath" "../../src"
```

## Communication Protocol Details

The MCP server expects messages in a specific format using the JSON-RPC
protocol:

1. Messages must include proper headers:
   ```
   Content-Length: <length>\r\n\r\n<json-payload>
   ```

2. Request format:
   ```json
   {
     "jsonrpc": "2.0",
     "id": "request-id",
     "method": "call_tool",
     "params": {
       "name": "tool_name",
       "arguments": { ... }
     }
   }
   ```

## Troubleshooting

### Server Communication Issues

If the server doesn't respond:

1. Verify you're using the correct SDK version
2. Ensure the server is properly initialized before sending requests
3. Check that the directories you're accessing are in the allowed list
4. Use proper message format with headers for manual communication

### Permission Issues

If you encounter permission errors:

1. Ensure test scripts are executable:
   ```bash
   chmod +x dist/*.js
   ```

2. Verify you have access to the directories specified in the server

### Type Errors

If you get TypeScript errors:

1. Use proper type definitions for responses:
   ```typescript
   interface ToolCallResponse {
       content?: Array<{ type: string; text: string }>;
       isError?: boolean;
   }
   ```

2. Use type assertions when needed:
   ```typescript
   const result = await client.callTool(...) as ToolCallResponse;
   ```

## Advanced Usage

### Custom Server Configuration

To use custom directories:

1. Modify the server initialization:
   ```typescript
   const server = spawn("node", [serverPath, "/your/custom/dir"], {
       stdio: "pipe",
   });
   ```

### Extending the Tests

To add new test cases:

1. Create a new TypeScript file in this directory
2. Use the SDK pattern for reliable communication:
   ```typescript
   import { Client } from "@modelcontextprotocol/sdk/client/index.js";
   import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
   ```
3. Add a script entry in package.json
