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
import os from 'os';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { diffLines, createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-server-filesystem <allowed-directory>[!excluded1,excluded2,...] [additional-directories...]");
  console.error("");
  console.error("Examples:");
  console.error("  mcp-server-filesystem /path/to/dir                    # Allow access to /path/to/dir");
  console.error("  mcp-server-filesystem /path/to/dir!.env,dist          # Allow access but exclude .env and dist");
  console.error("  mcp-server-filesystem /path1 /path2!.env,logs /path3  # Multiple directories with exclusions");
  console.error("  mcp-server-filesystem /path/to/dir!.env,!.git         # Exclude .env but override default .git exclusion");
  console.error("");
  console.error("Exclusion features:");
  console.error("  - .git and node_modules are excluded by default");
  console.error("  - Start a pattern with ! to explicitly include something that would otherwise be excluded");
  console.error("  - All exclusions are case-insensitive for security (e.g., .git will also match .GIT)");
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

// Default exclusion patterns that always apply
const DEFAULT_EXCLUSIONS = ['.git', 'node_modules'];

// Store allowed directories and their exclusions in normalized form
const allowedDirectoriesConfig = args.map(dir => {
  // Split on first ! only
  const sepIndex = dir.indexOf('!');
  const dirPath = sepIndex !== -1 ? dir.substring(0, sepIndex) : dir;
  const exclusionsString = sepIndex !== -1 ? dir.substring(sepIndex + 1) : null;

  let exclusions = [...DEFAULT_EXCLUSIONS];

  if (exclusionsString) {
    const patterns = exclusionsString.split(',');

    // Process negation patterns first
    for (const pattern of patterns) {
      if (pattern.startsWith('!')) {
        const includedPath = pattern.slice(1);

        // Create a new array without the negated path (case-insensitive)
        const lowerIncludedPath = includedPath.toLowerCase();
        exclusions = exclusions.filter(item => {
          return item.toLowerCase() !== lowerIncludedPath;
        });
      }
    }

    // Now add new exclusions
    for (const pattern of patterns) {
      if (!pattern.startsWith('!') && pattern.trim()) {
        exclusions.push(pattern);
      }
    }
  }

  return {
    path: normalizePath(path.resolve(expandHome(dirPath))),
    exclusions
  };
});

// Extract just the paths for backward compatibility
const allowedDirectories = allowedDirectoriesConfig.map(config => config.path);

// Validate that all directories exist and are accessible
await Promise.all(allowedDirectoriesConfig.map(async (config) => {
  try {
    const stats = await fs.stat(config.path);
    if (!stats.isDirectory()) {
      console.error(`Error: ${config.path} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing directory ${config.path}:`, error);
    process.exit(1);
  }
}));

function isPathExcluded(basePath: string, relativePath: string, exclusions: string[]): boolean {
  // Prevent the root directory itself from being excluded
  if (!relativePath || relativePath === '') {
    return false;
  }

  const fileName = path.basename(relativePath);
  const lowerFileName = fileName.toLowerCase();
  const lowerRelativePath = relativePath.toLowerCase();

  for (const exclusion of exclusions) {
    if (!exclusion || exclusion === '') {
      continue;
    }

    const lowerExclusion = exclusion.toLowerCase();

    // Handle the path format exclusions (containing slashes)
    if (lowerExclusion.includes('/')) {
      // Check if the relative path matches or starts with the exclusion path
      if (lowerRelativePath === lowerExclusion ||
          lowerRelativePath.startsWith(lowerExclusion + '/')) {
        return true;
      }
      continue;
    }

    // Special matching for filenames (no slashes)
    // This handles files like TSCONFIG.json matching tsconfig.json
    if (lowerFileName === lowerExclusion) {
      return true;
    }

    // 1. exact match (is exactly the excluded path)
    const exactMatch = lowerExclusion === lowerRelativePath;

    // 2. directory match (is the excluded directory or something inside it)
    const directoryPrefix = lowerRelativePath === lowerExclusion ||
                           lowerRelativePath.startsWith(lowerExclusion + '/');

    // 3. path contains the excluded directory anywhere in the hierarchy
    const pattern = '/' + lowerExclusion + '/';
    const nestedMatch = ('/' + lowerRelativePath + '/').includes(pattern);

    if (exactMatch || directoryPrefix || nestedMatch) {
      return true;
    }
  }
  return false;
}

// For each validation case, add filename matching logic to handle case-insensitive matching
async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  const normalizedRequested = normalizePath(absolute);

  const requestedFilename = path.basename(normalizedRequested);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Check if path is in excluded patterns
  for (const config of allowedDirectoriesConfig) {
    if (normalizedRequested.startsWith(config.path)) {
      // Find the relative path from the allowed directory
      const relativePath = path.relative(config.path, normalizedRequested);

      // Don't apply exclusions to the allowed directory itself
      if (normalizedRequested === config.path) {
        break;
      }

      // Direct filename comparison for case-insensitive matching
      for (const exclusion of config.exclusions) {
        // Skip directory exclusions for this check
        if (!exclusion.includes('/') && !exclusion.includes('*')) {
          // Compare filenames case-insensitively
          if (requestedFilename.toLowerCase() === exclusion.toLowerCase()) {
            throw new Error(`Access denied - path not accessible`);
          }
        }
      }

      // Check if the path matches any exclusion pattern
      if (isPathExcluded(config.path, relativePath, config.exclusions)) {
        // Use a generic message that doesn't reveal if the file exists
        throw new Error(`Access denied - path not accessible`);
      }
      break;
    }
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);

    // Check if real path is allowed
    const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }

    // Extract the filename for direct comparison in case of symlinks
    const realFilename = path.basename(normalizedReal);

    // Check if real path matches exclusions
    for (const config of allowedDirectoriesConfig) {
      if (normalizedReal.startsWith(config.path)) {
        const relativePath = path.relative(config.path, normalizedReal);

        // Don't apply exclusions to the allowed directory itself
        if (normalizedReal === config.path) {
          break;
        }

        // Direct filename comparison for case-insensitive matching (symlink target)
        for (const exclusion of config.exclusions) {
          // Skip directory exclusions for this check
          if (!exclusion.includes('/') && !exclusion.includes('*')) {
            // Compare filenames case-insensitively
            if (realFilename.toLowerCase() === exclusion.toLowerCase()) {
              throw new Error(`Access denied - path not accessible`);
            }
          }
        }

        if (isPathExcluded(config.path, relativePath, config.exclusions)) {
          // Use a generic message that doesn't reveal if the file exists
          throw new Error(`Access denied - path not accessible`);
        }
        break;
      }
    }

    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);

      // Check if parent path is allowed
      const isParentAllowed = allowedDirectories.some(dir => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        throw new Error("Access denied - parent directory outside allowed directories");
      }

      // Extract the parent directory name for direct comparison
      const parentDirName = path.basename(normalizedParent);

      // Check if parent path matches exclusions
      for (const config of allowedDirectoriesConfig) {
        if (normalizedParent.startsWith(config.path)) {
          const relativePath = path.relative(config.path, normalizedParent);

          // Don't apply exclusions to the allowed directory itself
          if (normalizedParent === config.path) {
            break;
          }

          // Direct dirname comparison for case-insensitive matching (parent directory)
          for (const exclusion of config.exclusions) {
            // Skip directory exclusions for this check
            if (!exclusion.includes('/') && !exclusion.includes('*')) {
              // Compare directory names case-insensitively
              if (parentDirName.toLowerCase() === exclusion.toLowerCase()) {
                throw new Error(`Access denied - path not accessible`);
              }
            }
          }

          if (isPathExcluded(config.path, relativePath, config.exclusions)) {
            // Use a generic message that doesn't reveal if the directory exists
            throw new Error(`Access denied - path not accessible`);
          }
          break;
        }
      }

      return absolute;
    } catch (err) {
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
      tools: {},
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
        // Skip checking validatePath explicitly (it will throw if not valid)
        // as it now checks for exclusions itself
        // Instead, just try to access the path and catch any access errors
        await fs.access(fullPath);

        // Check if path matches any exclude pattern from the function arguments
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some(pattern => {
          const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
          return minimatch(relativePath, globPattern, { dot: true });
        });

        if (shouldExclude) {
          continue;
        }

        // Try to validate the path - this will throw if path is in excluded patterns
        try {
          await validatePath(fullPath);
        } catch (error) {
          // Path is excluded by configuration, skip it
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

        // Filter out entries that match exclusion patterns
        const filteredEntries = await Promise.all(entries.map(async (entry) => {
          const entryPath = path.join(validPath, entry.name);
          try {
            // Try to validate the path - this will throw if excluded
            await validatePath(entryPath);
            // Entry is valid, include it
            return { valid: true, entry };
          } catch (error) {
            // Entry is excluded, don't include it
            return { valid: false, entry };
          }
        }));

        const formatted = filteredEntries
          .filter(result => result.valid) // Only keep valid entries
          .map(result => `${result.entry.isDirectory() ? "[DIR]" : "[FILE]"} ${result.entry.name}`)
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
                // This will throw if path is excluded
                const validPath = await validatePath(currentPath);
                const entries = await fs.readdir(validPath, {withFileTypes: true});
                const result: TreeEntry[] = [];

                for (const entry of entries) {
                    const subPath = path.join(currentPath, entry.name);

                    // Skip excluded paths
                    try {
                        await validatePath(subPath);
                    } catch (error) {
                        // Path is excluded, skip it
                        continue;
                    }

                    const entryData: TreeEntry = {
                        name: entry.name,
                        type: entry.isDirectory() ? 'directory' : 'file'
                    };

                    if (entry.isDirectory()) {
                        try {
                            entryData.children = await buildTree(subPath);
                        } catch (error) {
                            // If we can't process this directory, still include it but with empty children
                            entryData.children = [];
                        }
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
        const lines: string[] = ['Allowed directories:'];

        for (const config of allowedDirectoriesConfig) {
          lines.push(`- ${config.path}`);
          if (config.exclusions.length > 0) {
            lines.push(`  Excluded patterns: ${config.exclusions.join(', ')}`);
          }
        }

        return {
          content: [{
            type: "text",
            text: lines.join('\n')
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

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Secure MCP Filesystem Server running on stdio");
  console.error("Allowed directories:");
  for (const config of allowedDirectoriesConfig) {
    console.error(`- ${config.path}`);
    if (config.exclusions.length > 0) {
      console.error(`  Excluded patterns: ${config.exclusions.join(', ')}`);
    }
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
