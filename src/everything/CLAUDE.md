# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the "Everything" MCP server - a comprehensive test server that implements all features of the Model Context Protocol (MCP). It's designed as a reference implementation for MCP client builders, showcasing tools, resources, prompts, sampling, logging, and transport protocols.

## Build and Development Commands

- **Build**: `npm run build` - Compiles TypeScript to JavaScript and copies instructions.md to dist/
- **Watch mode**: `npm run watch` - Watches for TypeScript changes and rebuilds automatically  
- **Run server**: `npm run start` - Starts the MCP server using stdio transport
- **Run SSE server**: `npm run start:sse` - Starts the MCP server with Server-Sent Events transport
- **Run streamable HTTP server**: `npm run start:streamableHttp` - Starts with streamable HTTP transport
- **Prepare release**: `npm run prepare` - Builds the project for publishing

## Architecture and Key Components

### Core Files Structure
- `everything.ts` - Main server implementation with all MCP features (tools, resources, prompts)
- `index.ts` - Entry point that dynamically imports the appropriate transport server
- `stdio.ts` - Standard input/output transport server
- `sse.ts` - Server-Sent Events transport using Express
- `streamableHttp.ts` - Streamable HTTP transport server
- `instructions.md` - Runtime instructions loaded by the server

### Server Architecture
The server uses a factory pattern (`createServer()` in everything.ts) that returns:
- A configured MCP Server instance
- A cleanup function for graceful shutdown  
- Optional notification intervals for testing

### Transport Layers
Three transport protocols are supported:
1. **STDIO** (default) - For CLI clients and desktop applications
2. **SSE** - HTTP-based with Server-Sent Events (deprecated as of 2025-03-26)
3. **Streamable HTTP** - Modern HTTP streaming transport

### MCP Feature Implementation

**Tools (10 total)**: Echo, add, longRunningOperation with progress notifications, environment printing, LLM sampling, image generation, annotated messages, resource references, elicitation, and structured content

**Resources (100 total)**: Test resources with even IDs as plaintext and odd IDs as binary blobs. Features pagination, subscriptions with auto-updates every 5 seconds, and template support.

**Prompts (3 total)**: Simple prompt, complex prompt with arguments, and resource prompt with embedded references

**Real-time Features**: Automatic logging every 15 seconds, resource update notifications, and progress tracking for long operations

## Code Patterns and Conventions

### Schema Validation
All tool inputs use Zod schemas for validation and automatic JSON schema generation:
```typescript
const ToolSchema = z.object({
  parameter: z.string().describe("Parameter description")
});
```

### Error Handling
Use try/catch blocks with descriptive error messages. The server includes comprehensive error handling for all MCP operations.

### Resource Management  
Implement proper cleanup for intervals, timers, and subscriptions in the cleanup function returned by `createServer()`.

### TypeScript Configuration
- Uses ES modules with `.js` extensions in imports
- Extends parent tsconfig.json with output to `./dist`
- Strict typing throughout the codebase

## Testing and Validation

This server is specifically designed for testing MCP clients. It includes:
- Progress notifications via `_meta.progressToken` 
- Resource subscriptions with timed updates
- Multi-modal content in prompts and responses
- All MCP protocol features for comprehensive client testing