#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
  RootsListChangedNotificationSchema,
  type Root,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from 'os';
import { randomBytes } from 'crypto';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { normalizePath, expandHome } from './path-utils.js';
import { isPathWithinAllowedDirectories } from './path-validation.js';
import { getValidRootDirectories } from './roots-utils.js';
import {
  // Function imports
  formatSize,
  validatePath,
  getFileStats,
  readFileContent,
  writeFileContent,
  searchFilesWithValidation,
  applyFileEdits,
  tailFile,
  headFile
} from './lib.js';

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-server-filesystem [allowed-directory] [additional-directories...]");
  console.error("Note: Allowed directories can be provided via:");
  console.error("  1. Command-line arguments (shown above)");
  console.error("  2. MCP roots protocol (if client supports it)");
  console.error("At least one directory must be provided by EITHER method for the server to operate.");
}

// Store allowed directories in normalized and resolved form
let allowedDirectories = await Promise.all(
  args.map(async (dir) => {
    const expanded = expandHome(dir);
    const absolute = path.resolve(expanded);
    try {
      // Resolve symlinks in allowed directories during startup
      const resolved = await fs.realpath(absolute);
      return normalizePath(resolved);
    } catch (error) {
      // If we can't resolve (doesn't exist), use the normalized absolute path
      // This allows configuring allowed dirs that will be created later
      return normalizePath(absolute);
    }
  })
);

// Validate that all directories exist and are accessible
await Promise.all(allowedDirectories.map(async (dir) => {
  try {
    const stats = await fs.stat(dir);
    if (!stats.isDirectory()) {
      console.error(`Error: ${dir} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing directory ${dir}:`, error);
    process.exit(1);
  }
}));

// Schema definitions
const ReadFileArgsSchema = z.object({
  path: z.string(),
  tail: z.number().optional().describe('If provided, returns only the last N lines of the file'),
  head: z.number().optional().describe('If provided, returns only the first N lines of the file')
});

const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const EditOperation = z.object({
  oldText: z.string().describe('Text to search for - must match exactly'),
  newText: z.string().describe('Text to replace with')
});

const EditFileArgsSchema = z.object({
  path: z.string(),
  edits: z.array(EditOperation),
  dryRun: z.boolean().default(false).describe('Preview changes using git-style diff format')
});

const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryWithSizesArgsSchema = z.object({
  path: z.string(),
  sortBy: z.enum(['name', 'size']).optional().default('name').describe('Sort entries by name or size'),
});

const DirectoryTreeArgsSchema = z.object({
  path: z.string(),
});

const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  excludePatterns: z.array(z.string()).optional().default([])
});

const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

// Server setup
const server = new Server(
  {
    name: "secure-filesystem-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_file",
        description:
          "Read the complete contents of a file from the file system. " +
          "Handles various text encodings and provides detailed error messages " +
          "if the file cannot be read. Use this tool when you need to examine " +
          "the contents of a single file. Use the 'head' parameter to read only " +
          "the first N lines of a file, or the 'tail' parameter to read only " +
          "the last N lines of a file. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
      },
      {
        name: "read_multiple_files",
        description:
          "Read the contents of multiple files simultaneously. This is more " +
          "efficient than reading files one by one when you need to analyze " +
          "or compare multiple files. Each file's content is returned with its " +
          "path as a reference. Failed reads for individual files won't stop " +
          "the entire operation. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) as ToolInput,
      },
      {
        name: "write_file",
        description:
          "Create a new file or completely overwrite an existing file with new content. " +
          "Use with caution as it will overwrite existing files without warning. " +
          "Handles text content with proper encoding. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
      },
      {
        name: "edit_file",
        description:
          "Make line-based edits to a text file. Each edit replaces exact line sequences " +
          "with new content. Returns a git-style diff showing the changes made. " +
          "Only works within allowed directories.",
        inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
      },
      {
        name: "create_directory",
        description:
          "Create a new directory or ensure a directory exists. Can create multiple " +
          "nested directories in one operation. If the directory already exists, " +
          "this operation will succeed silently. Perfect for setting up directory " +
          "structures for projects or ensuring required paths exist. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "list_directory",
        description:
          "Get a detailed listing of all files and directories in a specified path. " +
          "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
          "prefixes. This tool is essential for understanding directory structure and " +
          "finding specific files within a directory. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "list_directory_with_sizes",
        description:
          "Get a detailed listing of all files and directories in a specified path, including sizes. " +
          "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
          "prefixes. This tool is useful for understanding directory structure and " +
          "finding specific files within a directory. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ListDirectoryWithSizesArgsSchema) as ToolInput,
      },
      {
        name: "directory_tree",
        description:
            "Get a recursive tree view of files and directories as a JSON structure. " +
            "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
            "Files have no children array, while directories always have a children array (which may be empty). " +
            "The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
      },
      {
        name: "move_file",
        description:
          "Move or rename files and directories. Can move files between directories " +
          "and rename them in a single operation. If the destination exists, the " +
          "operation will fail. Works across different directories and can be used " +
          "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
        inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
      },
      {
        name: "search_files",
        description:
          "Recursively search for files and directories matching a pattern. " +
          "Searches through all subdirectories from the starting path. The search " +
          "is case-insensitive and matches partial names. Returns full paths to all " +
          "matching items. Great for finding files when you don't know their exact location. " +
          "Only searches within allowed directories.",
        inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
      },
      {
        name: "get_file_info",
        description:
          "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
          "information including size, creation time, last modified time, permissions, " +
          "and type. This tool is perfect for understanding file characteristics " +
          "without reading the actual content. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
      },
      {
        name: "list_allowed_directories",
        description:
          "Returns the list of root directories that this server is allowed to access. " +
          "Use this to understand which directories are available before trying to access files. ",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  };
});


server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_file": {
        const parsed = ReadFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, allowedDirectories);
        
        if (parsed.data.head && parsed.data.tail) {
          throw new Error("Cannot specify both head and tail parameters simultaneously");
        }
        
        if (parsed.data.tail) {
          // Use memory-efficient tail implementation for large files
          const tailContent = await tailFile(validPath, parsed.data.tail);
          return {
            content: [{ type: "text", text: tailContent }],
          };
        }
        
        if (parsed.data.head) {
          // Use memory-efficient head implementation for large files
          const headContent = await headFile(validPath, parsed.data.head);
          return {
            content: [{ type: "text", text: headContent }],
          };
        }
        
        const content = await readFileContent(validPath);
        return {
          content: [{ type: "text", text: content }],
        };
      }

      case "read_multiple_files": {
        const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
        }
        const results = await Promise.all(
          parsed.data.paths.map(async (filePath: string) => {
            try {
              const validPath = await validatePath(filePath, allowedDirectories);
              const content = await readFileContent(validPath);
              return `${filePath}:\n${content}\n`;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              return `${filePath}: Error - ${errorMessage}`;
            }
          }),
        );
        return {
          content: [{ type: "text", text: results.join("\n---\n") }],
        };
      }

      case "write_file": {
        const parsed = WriteFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, allowedDirectories);
        await writeFileContent(validPath, parsed.data.content);
        return {
          content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }],
        };
      }

      case "edit_file": {
        const parsed = EditFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, allowedDirectories);
        const result = await applyFileEdits(validPath, parsed.data.edits, parsed.data.dryRun);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "create_directory": {
        const parsed = CreateDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, allowedDirectories);
        await fs.mkdir(validPath, { recursive: true });
        return {
          content: [{ type: "text", text: `Successfully created directory ${parsed.data.path}` }],
        };
      }

      case "list_directory": {
        const parsed = ListDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, allowedDirectories);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const formatted = entries
          .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
          .join("\n");
        return {
          content: [{ type: "text", text: formatted }],
        };
      }

      case "list_directory_with_sizes": {
        const parsed = ListDirectoryWithSizesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory_with_sizes: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, allowedDirectories);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        
        // Get detailed information for each entry
        const detailedEntries = await Promise.all(
          entries.map(async (entry) => {
            const entryPath = path.join(validPath, entry.name);
            try {
              const stats = await fs.stat(entryPath);
              return {
                name: entry.name,
                isDirectory: entry.isDirectory(),
                size: stats.size,
                mtime: stats.mtime
              };
            } catch (error) {
              return {
                name: entry.name,
                isDirectory: entry.isDirectory(),
                size: 0,
                mtime: new Date(0)
              };
            }
          })
        );
        
        // Sort entries based on sortBy parameter
        const sortedEntries = [...detailedEntries].sort((a, b) => {
          if (parsed.data.sortBy === 'size') {
            return b.size - a.size; // Descending by size
          }
          // Default sort by name
          return a.name.localeCompare(b.name);
        });
        
        // Format the output
        const formattedEntries = sortedEntries.map(entry => 
          `${entry.isDirectory ? "[DIR]" : "[FILE]"} ${entry.name.padEnd(30)} ${
            entry.isDirectory ? "" : formatSize(entry.size).padStart(10)
          }`
        );
        
        // Add summary
        const totalFiles = detailedEntries.filter(e => !e.isDirectory).length;
        const totalDirs = detailedEntries.filter(e => e.isDirectory).length;
        const totalSize = detailedEntries.reduce((sum, entry) => sum + (entry.isDirectory ? 0 : entry.size), 0);
        
        const summary = [
          "",
          `Total: ${totalFiles} files, ${totalDirs} directories`,
          `Combined size: ${formatSize(totalSize)}`
        ];
        
        return {
          content: [{ 
            type: "text", 
            text: [...formattedEntries, ...summary].join("\n") 
          }],
        };
      }

      case "directory_tree": {
        const parsed = DirectoryTreeArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
        }

        interface TreeEntry {
            name: string;
            type: 'file' | 'directory';
            children?: TreeEntry[];
        }

        async function buildTree(currentPath: string): Promise<TreeEntry[]> {
            const validPath = await validatePath(currentPath, allowedDirectories);
            const entries = await fs.readdir(validPath, {withFileTypes: true});
            const result: TreeEntry[] = [];

            for (const entry of entries) {
                const entryData: TreeEntry = {
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file'
                };

                if (entry.isDirectory()) {
                    const subPath = path.join(currentPath, entry.name);
                    entryData.children = await buildTree(subPath);
                }

                result.push(entryData);
            }

            return result;
        }

        const treeData = await buildTree(parsed.data.path);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(treeData, null, 2)
            }],
        };
      }

      case "move_file": {
        const parsed = MoveFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
        }
        const validSourcePath = await validatePath(parsed.data.source, allowedDirectories);
        const validDestPath = await validatePath(parsed.data.destination, allowedDirectories);
        await fs.rename(validSourcePath, validDestPath);
        return {
          content: [{ type: "text", text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}` }],
        };
      }

      case "search_files": {
        const parsed = SearchFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, allowedDirectories);
        const results = await searchFilesWithValidation(validPath, parsed.data.pattern, allowedDirectories, { excludePatterns: parsed.data.excludePatterns });
        return {
          content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }],
        };
      }

      case "get_file_info": {
        const parsed = GetFileInfoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path, allowedDirectories);
        const info = await getFileStats(validPath);
        return {
          content: [{ type: "text", text: Object.entries(info)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n") }],
        };
      }

      case "list_allowed_directories": {
        return {
          content: [{
            type: "text",
            text: `Allowed directories:\n${allowedDirectories.join('\n')}`
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Updates allowed directories based on MCP client roots
async function updateAllowedDirectoriesFromRoots(requestedRoots: Root[]) {
  const validatedRootDirs = await getValidRootDirectories(requestedRoots);
  if (validatedRootDirs.length > 0) {
    allowedDirectories = [...validatedRootDirs];
    console.error(`Updated allowed directories from MCP roots: ${validatedRootDirs.length} valid directories`);
  } else {
    console.error("No valid root directories provided by client");
  }
}

// Handles dynamic roots updates during runtime, when client sends "roots/list_changed" notification, server fetches the updated roots and replaces all allowed directories with the new roots.
server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
  try {
    // Request the updated roots list from the client
    const response = await server.listRoots();
    if (response && 'roots' in response) {
      await updateAllowedDirectoriesFromRoots(response.roots);
    }
  } catch (error) {
    console.error("Failed to request roots from client:", error instanceof Error ? error.message : String(error));
  }
});

// Handles post-initialization setup, specifically checking for and fetching MCP roots.
server.oninitialized = async () => {
  const clientCapabilities = server.getClientCapabilities();

  if (clientCapabilities?.roots) {
    try {
      const response = await server.listRoots();
      if (response && 'roots' in response) {
        await updateAllowedDirectoriesFromRoots(response.roots);
      } else {
        console.error("Client returned no roots set, keeping current settings");
      }
    } catch (error) {
      console.error("Failed to request initial roots from client:", error instanceof Error ? error.message : String(error));
    }
  } else {
    if (allowedDirectories.length > 0) {
      console.error("Client does not support MCP Roots, using allowed directories set from server args:", allowedDirectories);
    }else{
      throw new Error(`Server cannot operate: No allowed directories available. Server was started without command-line directories and client either does not support MCP roots protocol or provided empty roots. Please either: 1) Start server with directory arguments, or 2) Use a client that supports MCP roots protocol and provides valid root directories.`);
    }
  }
};

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Secure MCP Filesystem Server running on stdio");
  if (allowedDirectories.length === 0) {
    console.error("Started without allowed directories - waiting for client to provide roots via MCP protocol");
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
