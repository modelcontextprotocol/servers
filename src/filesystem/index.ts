#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from 'os';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createTwoFilesPatch } from 'diff';
import * as mimeTypes from 'mime-types';
import { minimatch } from 'minimatch';
import { BigIntStats, stat, Stats } from "fs";

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-server-filesystem <allowed-directory> [additional-directories...]");
  process.exit(1);
}

// Normalize all paths consistently
function normalizePath(p: string): string {
  return path.normalize(p);
}

function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Store allowed directories in normalized form
const allowedDirectories = args.map(dir =>
  normalizePath(path.resolve(expandHome(dir)))
);

// Validate that all directories exist and are accessible
await Promise.all(args.map(async (dir) => {
  try {
    const stats = await fs.stat(expandHome(dir));
    if (!stats.isDirectory()) {
      console.error(`Error: ${dir} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing directory ${dir}:`, error);
    process.exit(1);
  }
}));

// Security utilities
async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
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

// Schema definitions
const ReadFileArgsSchema = z.object({
  path: z.string(),
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

interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

// Server setup
const server = new Server(
  {
    name: "secure-filesystem-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {}
    },
  },
);

// Tool implementations
async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = []
): Promise<string[]> {
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      try {
        // Validate each path before processing
        await validatePath(fullPath);

        // Check if path matches any exclude pattern
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some(pattern => {
          const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
          return minimatch(relativePath, globPattern, { dot: true });
        });

        if (shouldExclude) {
          continue;
        }

        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // Skip invalid paths during search
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}

// file editing and diffing utilities
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function createUnifiedDiff(originalContent: string, newContent: string, filepath: string = 'file'): string {
  // Ensure consistent line endings for diff
  const normalizedOriginal = normalizeLineEndings(originalContent);
  const normalizedNew = normalizeLineEndings(newContent);

  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    'original',
    'modified'
  );
}

async function applyFileEdits(
  filePath: string,
  edits: Array<{oldText: string, newText: string}>,
  dryRun = false
): Promise<string> {
  // Read file content and normalize line endings
  const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));

  // Apply edits sequentially
  let modifiedContent = content;
  for (const edit of edits) {
    const normalizedOld = normalizeLineEndings(edit.oldText);
    const normalizedNew = normalizeLineEndings(edit.newText);

    // If exact match exists, use it
    if (modifiedContent.includes(normalizedOld)) {
      modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
      continue;
    }

    // Otherwise, try line-by-line matching with flexibility for whitespace
    const oldLines = normalizedOld.split('\n');
    const contentLines = modifiedContent.split('\n');
    let matchFound = false;

    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      const potentialMatch = contentLines.slice(i, i + oldLines.length);

      // Compare lines with normalized whitespace
      const isMatch = oldLines.every((oldLine, j) => {
        const contentLine = potentialMatch[j];
        return oldLine.trim() === contentLine.trim();
      });

      if (isMatch) {
        // Preserve original indentation of first line
        const originalIndent = contentLines[i].match(/^\s*/)?.[0] || '';
        const newLines = normalizedNew.split('\n').map((line, j) => {
          if (j === 0) return originalIndent + line.trimStart();
          // For subsequent lines, try to preserve relative indentation
          const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || '';
          const newIndent = line.match(/^\s*/)?.[0] || '';
          if (oldIndent && newIndent) {
            const relativeIndent = newIndent.length - oldIndent.length;
            return originalIndent + ' '.repeat(Math.max(0, relativeIndent)) + line.trimStart();
          }
          return line;
        });

        contentLines.splice(i, oldLines.length, ...newLines);
        modifiedContent = contentLines.join('\n');
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
    }
  }

  // Create unified diff
  const diff = createUnifiedDiff(content, modifiedContent, filePath);

  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes('`'.repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}\n\n`;

  if (!dryRun) {
    await fs.writeFile(filePath, modifiedContent, 'utf-8');
  }

  return formattedDiff;
}

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
          "the contents of a single file. Only works within allowed directories.",
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
          "Returns the list of directories that this server is allowed to access. " +
          "Use this to understand which directories are available before trying to access files.",
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
        const validPath = await validatePath(parsed.data.path);
        const content = await fs.readFile(validPath, "utf-8");
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
              const validPath = await validatePath(filePath);
              const content = await fs.readFile(validPath, "utf-8");
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
        const validPath = await validatePath(parsed.data.path);
        await fs.writeFile(validPath, parsed.data.content, "utf-8");
        return {
          content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }],
        };
      }

      case "edit_file": {
        const parsed = EditFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
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
        const validPath = await validatePath(parsed.data.path);
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
        const validPath = await validatePath(parsed.data.path);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const formatted = entries
          .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
          .join("\n");
        return {
          content: [{ type: "text", text: formatted }],
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
                const validPath = await validatePath(currentPath);
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
        const validSourcePath = await validatePath(parsed.data.source);
        const validDestPath = await validatePath(parsed.data.destination);
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
        const validPath = await validatePath(parsed.data.path);
        const results = await searchFiles(validPath, parsed.data.pattern, parsed.data.excludePatterns);
        return {
          content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }],
        };
      }

      case "get_file_info": {
        const parsed = GetFileInfoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
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

      case "load_folder": {
        const MAX_FILES = 30;
        const ctx = args as { path: string } | undefined;
        if (!ctx?.path) {
          throw new Error("No folder path provided");
        }

        // Validate and get the real path
        const validPath = await validatePath(ctx.path);
        
        // Verify it's a directory
        const stats = await fs.stat(validPath);
        if (!stats.isDirectory()) {
          throw new Error("Path must be a directory");
        }

        const messages = [];
        let fileCount = 0;

        // Recursive function to process directory
        async function processDirectory(dirPath: string) {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            // Check file limit before processing each entry
            if (fileCount >= MAX_FILES) {
              throw new Error(`Too many files - maximum is ${MAX_FILES}`);
            }

            const fullPath = path.join(dirPath, entry.name);
            
            try {
              // Validate path before processing
              await validatePath(fullPath);

              if (entry.isDirectory()) {
                // Recursively process subdirectories
                await processDirectory(fullPath);
              } else if (entry.isFile()) {
                fileCount++; // Increment counter for each file processed
                // Use absolute path for URI
                const absolutePath = path.resolve(fullPath);
                const uriPath = absolutePath.split(path.sep).join('/');
                const uri = `file://${uriPath}`;
                
                // Detect mime type
                const mimeType = mimeTypes.lookup(fullPath) || 'application/octet-stream';
                const fileStats = await fs.stat(fullPath);
                const loadType = loadAsType(mimeType, fileStats);

                // Read file content
                let content;
                switch (loadType) {
                  case FileType.TEXT:
                    content = await fs.readFile(fullPath, 'utf8');
                    messages.push({
                      role: "user",
                      content: {
                        type: "resource",
                        resource: {
                          uri,
                          mimeType,
                          text: content
                        }
                      }
                    });
                    break;
                    
                  case FileType.IMAGE:
                    content = (await fs.readFile(fullPath)).toString('base64');
                    messages.push({
                      role: "user",
                      content: {
                        type: "image",
                        data: content,
                        mimeType,
                      }
                    });
                    break;
                    
                  case FileType.BINARY:
                    content = (await fs.readFile(fullPath)).toString('base64');
                    messages.push({
                      role: "user",
                      content: {
                        type: "resource",
                        resource: {
                          uri,
                          mimeType,
                          blob: content
                        }
                      }
                    });
                    break;
                  default:
                    // Skip unsupported file types
                    continue;
                }
                messages.push({
                  role: "assistant",
                  content: {
                    type: "text",
                    text: `Loaded file ${uriPath}`
                  }
                });
              }
            } catch (error) {
              // Log error but continue processing other files
              console.error(`Error processing ${fullPath}:`, error);
              continue;
            }
          }
        }

        // Start recursive processing from the root directory
        await processDirectory(validPath);

        if (messages.length === 0) {
          throw new Error("No readable files found in directory");
        }

        messages.push({
          role: "assistant",
          content: {
            type: "text",
            text: `Loaded ${messages.length / 2} files recursively from ${validPath}`
          }
        });
        return { messages };
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

// Add this handler after the other resource handlers
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
  return {
    resourceTemplates: [
      {
        uriTemplate: "file://{path}",
        name: "File Resource",
        description: "A file on the local filesystem",
      },
      {
        uriTemplate: "folder://{path}",
        name: "File Resource",
        description: "A folder on the local filesystem",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  try {
    // Handle both file:// and folder:// URIs
    const match = request.params.uri.match(/^(file|folder):\/\/(.+)/);
    if (!match) {
      throw new Error('Invalid URI format');
    }

    const [, scheme, pathStr] = match;
    // Convert URI slashes to platform-specific path separators
    const platformPath = pathStr.split('/').join(path.sep);
    const validPath = await validatePath(platformPath);
    
    // Get file stats to determine type
    const stats = await fs.stat(validPath);
    
    switch (scheme) {
      case 'folder': {
        if (!stats.isDirectory()) {
          throw new Error('folder:// URI must point to a directory');
        }
        const entries = await fs.readdir(validPath);
        return {
          contents: [{
            uri: request.params.uri,
            mimeType: 'inode/directory',
            text: entries.join('\n')
          }]
        };
      }
      
      case 'file': {
        // TODO: verify that this supports symlinks and other weird file types.
        if (!stats.isFile()) {
          throw new Error('file:// URI must point to a file');
        }
        const mimeType = mimeTypes.lookup(validPath) || 'application/x-unknown';
        const typeToUse = loadAsType(mimeType, stats);
        
        if (typeToUse === FileType.TEXT) {
          const content = await fs.readFile(validPath, 'utf8');
          return {
            contents: [{
              uri: request.params.uri,
              description: `File ${pathStr}`,
              mimeType,
              text: content
            }]
          };
        } else {
          const content = await fs.readFile(validPath);
          return {
            contents: [{
              uri: request.params.uri,
              description: `File ${pathStr}`,
              mimeType,
              blob: content.toString('base64')
            }]
          };
        }
      }
      
      default:
        throw new Error(`Unsupported URI scheme: ${scheme}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read resource ${request.params.uri}: ${errorMessage}`);
  }
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case "load_file": {
        const ctx = args as { path: string } | undefined;
        if (!ctx?.path) {
          throw new Error("No resource path provided");
        }

        // Validate and get the real path
        const validPath = await validatePath(ctx.path);
        
        // Get file stats and determine type
        const stats = await fs.stat(validPath);
        if (stats.isDirectory()) {
          throw new Error("Cannot analyze directories, only files");
        }

        // Use mime-types to detect MIME type
        const mimeType = mimeTypes.lookup(validPath) || 'application/octet-stream';

        const loadType = loadAsType(mimeType, stats);
        
        const absolutePath = path.resolve(validPath);
        const uriPath = absolutePath.split(path.sep).join('/');
        const uri = `file://${uriPath}`;

        // Read file content
        let content;
        if (loadType === FileType.TEXT) {
          content = await fs.readFile(validPath, 'utf8');
        } else {
          content = (await fs.readFile(validPath)).toString('base64');
        }
        
        // Create prompt messages
        return {
          messages: [
            {
              role: "user",
              content: loadType === FileType.IMAGE ? {
                type: "image",
                data: content,
                mimeType,
              } : {
                type: "resource",
                resource: {
                  uri,
                  mimeType,
                  ...(loadType === FileType.TEXT ? { text: content } : { blob: content }),
                }
              }
            },
            {
              role: "assistant",
              content: {
                type: "text",
                text: `Loaded file ${uriPath}`
              }
            },
          ]
        };
      }

      case "load_folder": {
        const ctx = args as { path: string } | undefined;
        if (!ctx?.path) {
          throw new Error("No folder path provided");
        }

        // Validate and get the real path
        const validPath = await validatePath(ctx.path);
        
        // Verify it's a directory
        const stats = await fs.stat(validPath);
        if (!stats.isDirectory()) {
          throw new Error("Path must be a directory");
        }

        const messages = [];

        // Recursive function to process directory
        async function processDirectory(dirPath: string) {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            // Validate path before processing
            await validatePath(fullPath);

            if (entry.isDirectory()) {
              // Recursively process subdirectories
              await processDirectory(fullPath);
            } else if (entry.isFile()) {
              // Use absolute path for URI
              const absolutePath = path.resolve(fullPath);
              const uriPath = absolutePath.split(path.sep).join('/');
              const uri = `file://${uriPath}`;
              
              // Detect mime type
              const mimeType = mimeTypes.lookup(fullPath) || 'application/octet-stream';
              const fileStats = await fs.stat(fullPath);
              const loadType = loadAsType(mimeType, fileStats);

              // Read file content
              let content;
              switch (loadType) {
                case FileType.TEXT:
                  content = await fs.readFile(fullPath, 'utf8');
                  messages.push({
                    role: "user",
                    content: {
                      type: "resource",
                      resource: {
                        uri,
                        mimeType,
                        text: content
                      }
                    }
                  });
                  break;
                  
                case FileType.IMAGE:
                  content = (await fs.readFile(fullPath)).toString('base64');
                  messages.push({
                    role: "user",
                    content: {
                      type: "image",
                      data: content,
                      mimeType,
                    }
                  });
                  break;
                  
                case FileType.BINARY:
                  content = (await fs.readFile(fullPath)).toString('base64');
                  messages.push({
                    role: "user",
                    content: {
                      type: "resource",
                      resource: {
                        uri,
                        mimeType,
                        blob: content
                      }
                    }
                  });
                  break;
                default:
                  // Skip unsupported file types
                  continue;
              }
              messages.push({
                role: "assistant",
                content: {
                  type: "text",
                  text: `Loaded file ${uriPath}`
                }
              });
            }
          }
        }

        // Start recursive processing from the root directory
        await processDirectory(validPath);

        if (messages.length === 0) {
          throw new Error("No readable files found in directory");
        }

        messages.push({
          role: "assistant",
          content: {
            type: "text",
            text: `Loaded ${messages.length / 2} files recursively from ${validPath}`
          }
        });
        return { messages };
      }

      default:
        throw new Error(`Unknown prompt name: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to handle prompt ${request.params.name}: ${errorMessage}`);
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'load_file',
        description: "Load and analyze contents of a single file with automatic type detection and appropriate handling for text, image, and binary files",
        arguments: [
          {
            name: "path",
            description: "Path to the file relative to workspace root",
            type: "string",
            required: true,
          }
        ]
      },
      {
        name: 'load_folder',
        description: "Recursively load and analyze all files in a directory and its subdirectories (limited to 30 files maximum). Automatically detects and appropriately handles different file types, skipping unsupported ones.",
        arguments: [
          {
            name: "path",
            description: "Path to the directory relative to workspace root",
            type: "string",
            required: true,
          }
        ]
      }
    ]
  };
});

// Define the FileType enum
enum FileType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  BINARY = 'BINARY',
}

// Utility function to determine file type
function loadAsType(mimeType: string, stats: Stats | BigIntStats): FileType {
  if (mimeType.startsWith('text/') || 
      ['application/json', 'application/javascript', 'application/typescript', 'application/xml', 'application/csv', 'application/tsv'].includes(mimeType)) {
    return FileType.TEXT;
  }

  if (mimeType.startsWith('image/')) {
    return FileType.IMAGE;
  }

  if (['application/octet-stream', 'application/pdf', 'application/zip', 'application/x-tar', 'application/x-gzip', 'application/x-bzip2', 'application/x-7z-compressed', 'application/x-rar', 'application/x-xz'].includes(mimeType)) {
    return FileType.BINARY;
  }

  // If file is smaller than 100kb and type is unknown, treat as text
  if (stats.size < 100 * 1024) {
    return FileType.TEXT;
  }

  // Otherwise fall back to binary
  return FileType.BINARY;
}

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Secure MCP Filesystem Server running on stdio");
  console.error("Allowed directories:", allowedDirectories);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
