#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { diffLines, createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import { normalizePath, expandHome } from './path-utils.js';

console.error('[STARTUP] Filesystem MCP server starting...');

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-server-filesystem <allowed-directory> [additional-directories...]");
  process.exit(1);
}

console.error('[STARTUP] Processing arguments:', args);

// Store allowed directories in normalized form - normalize before quoting
const allowedDirectories = args.map(dir => {
  const normalized = normalizePath(path.resolve(expandHome(dir)));
  console.error(`[STARTUP] Normalized directory ${dir} to ${normalized}`);
  return normalized;
});

console.error('[STARTUP] Normalized allowed directories:', allowedDirectories);

// Validate that all directories exist and are accessible
await Promise.all(allowedDirectories.map(async (dir) => {
  try {
    const stats = await fs.stat(expandHome(dir));
    if (!stats.isDirectory()) {
      console.error(`Error: ${dir} is not a directory`);
      process.exit(1);
    }
    console.error(`[STARTUP] Successfully validated directory: ${dir}`);
  } catch (error) {
    console.error(`Error accessing directory ${dir}:`, error);
    process.exit(1);
  }
}));

// Security utilities
export async function validatePath(requestedPath: string): Promise<string> {
  // Normalize the path first to handle any special characters or formats
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  // Ensure consistent normalization for security checks
  const normalizedRequested = normalizePath(absolute);
  console.error(`[DEBUG] Normalized requested path: ${normalizedRequested}`);

  // Check if path is within allowed directories using normalized paths
  const isAllowed = allowedDirectories.some(dir => {
    const result = normalizedRequested.startsWith(dir);
    console.error(`[DEBUG] Checking against allowed dir: ${dir} -> ${result}`);
    return result;
  });
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    console.error(`[DEBUG] Normalized real path: ${normalizedReal}`);
    const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some(dir => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// Tool schemas
const ListDirectorySchema = z.object({
  path: z.string().describe("Path to list contents for"),
  recursive: z.boolean().optional().describe("Whether to list recursively"),
});

const ReadFileSchema = z.object({
  path: z.string().describe("Path of file to read"),
});

// Initialize MCP server
console.error('[STARTUP] Initializing MCP server...');
const server = new Server(
  {
    name: "filesystem",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_directory",
      description: "List contents of a directory",
      inputSchema: zodToJsonSchema(ListDirectorySchema),
    },
    {
      name: "read_file",
      description: "Read contents of a file",
      inputSchema: zodToJsonSchema(ReadFileSchema),
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!request.params.arguments || typeof request.params.arguments !== 'object') {
    throw new Error('Invalid arguments');
  }

  const args = request.params.name === 'list_directory' 
    ? ListDirectorySchema.parse(request.params.arguments)
    : ReadFileSchema.parse(request.params.arguments);

  // Validate the path - validatePath already handles normalization
  const validatedPath = await validatePath(args.path);
  
  switch (request.params.name) {
    case "list_directory": {
      try {
        const stats = await fs.stat(validatedPath);
        if (!stats.isDirectory()) {
          throw new Error(`Not a directory: ${args.path}`);
        }
        
        const entries = await fs.readdir(validatedPath, { withFileTypes: true });
        const contents = entries.map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
          path: path.join(args.path, entry.name)
        }));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(contents, null, 2)
            }
          ]
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        return {
          content: [
            {
              type: "text",
              text: `Error listing directory: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
    
    case "read_file": {
      try {
        const stats = await fs.stat(validatedPath);
        if (!stats.isFile()) {
          throw new Error(`Not a file: ${args.path}`);
        }
        
        const content = await fs.readFile(validatedPath, 'utf8');
        return {
          content: [
            {
              type: "text",
              text: content
            }
          ]
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        return {
          content: [
            {
              type: "text",
              text: `Error reading file: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
    
    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

// Connect server to stdio transport
console.error('[STARTUP] Connecting to stdio transport...');
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[STARTUP] Server connected and ready');
