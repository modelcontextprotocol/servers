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
  path: z.string().describe('File path to edit'),
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

const SearchFilesByNameArgsSchema = z.object({
  path: z.string().describe('The root directory path to start the search from'),
  pattern: z.string().describe('Pattern to match within file/directory names. Supports glob patterns. ' +
    'Case insensitive unless pattern contains uppercase characters.'),
  excludePatterns: z.array(z.string())
    .optional()
    .default([])
    .describe('Glob patterns for paths to exclude from search (e.g., "node_modules/**")')
});

const SearchFilesContentArgsSchema = z.object({
  path: z.string().describe('Path to search - can be either a file path or a directory to search recursively'),
  pattern: z.string().describe('Text pattern to search for - supports plain text substring matching or regex patterns'),
  useRegex: z.boolean()
    .optional()
    .default(false)
    .describe('Whether to interpret the pattern as a regular expression.'),
  caseSensitive: z.boolean()
    .optional()
    .default(false)
    .describe('Whether to perform case-sensitive matching.'),
  maxResults: z.number()
    .optional()
    .default(100)
    .describe('Maximum number of matching results to return.'),
  contextLines: z.number()
    .optional()
    .default(2)
    .describe('Number of lines to show before and after each match.'),
  excludePatterns: z.array(z.string())
    .optional()
    .default([])
    .describe('Glob patterns for paths to exclude from search (e.g., "node_modules/**", "*.test.ts")'),
  includeTypes: z.array(z.string())
    .optional()
    .default([])
    .describe('File extensions to include (e.g., ["ts", "js", "tsx"]). If empty, includes all files'),
  excludeTypes: z.array(z.string())
    .optional()
    .default([])
    .describe('File extensions to exclude (e.g., ["jpg", "png"]). Ignored if includeTypes is not empty')
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

async function searchFileContents(
  rootPath: string,
  pattern: string,
  caseSensitive: boolean = false,
  maxResults: number = 100,
  contextLines: number = 2,
  excludePatterns: string[] = [],
  includeTypes: string[] = [],
  excludeTypes: string[] = [],
  useRegex: boolean = false
): Promise<string[]> {
  const results: string[] = [];
  const resultCount = { value: 0 }; // Object to track count across recursive calls

  // Define the type for search results
  interface SearchBatchResult {
    results: string[];
    dirs: string[];
  }

  // Prepare the search pattern
  let searchPattern: string | RegExp;

  if (useRegex) {
    try {
      // Add multiline flag for better pattern matching across lines
      searchPattern = new RegExp(pattern, (caseSensitive ? '' : 'i') + 'm');
    } catch (error: any) {
      throw new Error(`Invalid regex pattern: ${error.message || String(error)}`);
    }
  } else {
    searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
  }

  // Pre-compile exclude patterns
  const compiledExcludes = excludePatterns.map(pattern => {
    return (path: string) => minimatch(path, pattern, {
      dot: true,
      nocase: !caseSensitive,  // Make case sensitivity consistent with the search
      matchBase: !pattern.includes('/') // Match basename if no path separators
    });
  });

  // Determine file extensions to include/exclude
  const normalizedIncludeTypes = includeTypes.map(ext => ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`);
  const normalizedExcludeTypes = excludeTypes.map(ext => ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`);

  // Function to check if a file should be processed based on its extension
  const shouldProcessFileType = (filePath: string): boolean => {
    const ext = path.extname(filePath).toLowerCase();

    // Specially handle files without extensions
    if (!ext && (normalizedIncludeTypes.length > 0 || normalizedExcludeTypes.length > 0)) {
      // If including specific types, exclude files without extensions
      // unless '.', '' or 'noext' is explicitly included
      if (normalizedIncludeTypes.length > 0) {
        return normalizedIncludeTypes.some(type =>
          type === '' || type === '.' || type === '.noext');
      }
      // For excludes, check if files without extensions should be excluded
      return !normalizedExcludeTypes.includes('') &&
        !normalizedExcludeTypes.includes('.') &&
        !normalizedExcludeTypes.includes('.noext');
    }

    // For files with extensions, continue with the existing logic
    if (normalizedIncludeTypes.length > 0) {
      return normalizedIncludeTypes.includes(ext);
    }

    // Otherwise, exclude specified types
    if (normalizedExcludeTypes.length > 0) {
      return !normalizedExcludeTypes.includes(ext);
    }

    return true;
  };

  // Function to check if a path should be excluded
  const shouldExclude = (relativePath: string): boolean => {
    return compiledExcludes.some(matchFn => matchFn(relativePath));
  };

  // Format search results with context lines
  const formatSearchResult = (filePath: string, content: string, lineNumber: number, line: string): string => {
    const lines = content.split('\n');
    const startLine = Math.max(0, lineNumber - contextLines);
    const endLine = Math.min(lines.length - 1, lineNumber + contextLines);

    // Show just the file path and line number as the header
    let result = `${filePath}:${lineNumber + 1}: ${line.trim()}`;

    // Add context if requested - this includes the matched line with highlighting
    if (contextLines > 0) {
      result += '\nContext:';
      for (let i = startLine; i <= endLine; i++) {
        const prefix = i === lineNumber ? '> ' : '  ';
        result += `\n${prefix}${i + 1}: ${lines[i]}`;
      }
    }

    return result;
  };

  // Safely read and search text file contents
  const searchTextFile = async (filePath: string): Promise<string[]> => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const matchResults: string[] = [];
      let reachedLimit = false;

      // Use a dedicated loop to avoid callback overhead for large files
      for (let i = 0; i < lines.length && resultCount.value < maxResults; i++) {
        const line = lines[i];
        let isMatch = false;

        if (useRegex) {
          // Reset regex state for each line
          (searchPattern as RegExp).lastIndex = 0;
          isMatch = (searchPattern as RegExp).test(line);
        } else {
          const lineToSearch = caseSensitive ? line : line.toLowerCase();
          isMatch = lineToSearch.includes(searchPattern as string);
        }

        if (isMatch) {
          matchResults.push(formatSearchResult(filePath, content, i, line));
          resultCount.value++;

          // Check if we've reached the maximum results limit
          if (resultCount.value >= maxResults) {
            reachedLimit = true;
            break;
          }
        }
      }

      // Add max results notification if we hit the limit during this file
      if (reachedLimit && matchResults.length > 0) {
        matchResults.push(`\nReached maximum result limit (${maxResults}). Additional matches may exist.`);
      }

      return matchResults;
    } catch (error) {
      // Skip files that can't be read as text
      return [];
    }
  };

  // First check if rootPath is a file
  const stats = await fs.stat(rootPath);
  if (stats.isFile()) {
    // If it's a file, search it directly
    if (shouldProcessFileType(rootPath)) {
      const fileResults = await searchTextFile(rootPath);
      return fileResults;
    }
    return [];
  }
  // Otherwise, it should be a directory
  const queue: string[] = [rootPath];
  const processedPaths = new Set<string>();

  // Process directories breadth-first
  while (queue.length > 0 && resultCount.value < maxResults) {
    const currentBatch = [...queue];
    queue.length = 0;

    // Process batch in parallel with controlled result accumulation
    const batchResults: SearchBatchResult[] = await Promise.all(
      currentBatch.map(async (currentPath) => {
        if (processedPaths.has(currentPath)) return { results: [] as string[], dirs: [] as string[] };
        processedPaths.add(currentPath);
        const localResults: string[] = [];

        try {
          await validatePath(currentPath);
          const entries = await fs.readdir(currentPath, { withFileTypes: true });
          const localDirs: string[] = [];

          // Process entries
          for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            const relativePath = path.relative(rootPath, fullPath);

            // Skip excluded paths
            if (shouldExclude(relativePath)) continue;

            try {
              await validatePath(fullPath);

              if (entry.isDirectory()) {
                // Collect directories for next batch
                localDirs.push(fullPath);
              } else if (entry.isFile() && shouldProcessFileType(fullPath)) {
                // Search file contents
                const fileResults = await searchTextFile(fullPath);
                if (fileResults.length > 0) {
                  localResults.push(...fileResults);
                }
              }
            } catch (error) {
              // Skip invalid paths
              continue;
            }
          }

          // Return both results and directories to add to the queue
          return { results: localResults, dirs: localDirs };
        } catch (error) {
          // Skip inaccessible directories
          return { results: [] as string[], dirs: [] as string[] };
        }
      })
    );

    // Safely accumulate results after all promises are resolved
    for (const batch of batchResults) {
      // Add new directories to the queue
      if (batch.dirs) {
        queue.push(...batch.dirs);
      }

      // Add results with limit checking
      if (batch.results) {
        for (const result of batch.results) {
          results.push(result);
          resultCount.value++;
          if (resultCount.value >= maxResults) break;
        }
      }

      if (resultCount.value >= maxResults) break;
    }
  }
  return results;

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

async function searchFilesByName(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = []
): Promise<string[]> {
  const results: string[] = [];
  const queue: string[] = [rootPath];
  const processedPaths = new Set<string>();
  const caseSensitive = /[A-Z]/.test(pattern); // Check if pattern has uppercase characters

  // Determine if the pattern is a glob pattern or a simple substring
  const isGlobPattern = pattern.includes('*') || pattern.includes('?') || pattern.includes('[') || pattern.includes('{');

  // Prepare the matcher function based on pattern type
  let matcher: (name: string, fullPath: string) => boolean;

  if (isGlobPattern) {
    // For glob patterns, use minimatch
    matcher = (name: string, fullPath: string) => {
      // Handle different pattern types
      if (pattern.includes('/')) {
        // If pattern has path separators, match against relative path from root
        const relativePath = path.relative(rootPath, fullPath);
        return minimatch(relativePath, pattern, { nocase: !caseSensitive, dot: true });
      } else {
        // If pattern has no path separators, match just against the basename
        return minimatch(name, pattern, { nocase: !caseSensitive, dot: true });
      }
    };
  } else {
    // For simple substrings, use includes() for better performance
    const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
    matcher = (name: string) => {
      const nameToMatch = caseSensitive ? name : name.toLowerCase();
      return nameToMatch.includes(searchPattern);
    };
  }

  // Pre-compile exclude patterns to minimize repeated processing
  const compiledExcludes = excludePatterns.map(pattern => {
    const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
    return (path: string) => minimatch(path, globPattern, { dot: true });
  });

  // Function to check if a path should be excluded
  const shouldExclude = (relativePath: string): boolean => {
    return compiledExcludes.some(matchFn => matchFn(relativePath));
  };

  // Process directories in a breadth-first manner
  while (queue.length > 0) {
    const currentBatch = [...queue]; // Copy current queue for parallel processing
    queue.length = 0; // Clear queue for next batch

    // Process current batch in parallel
    const entriesBatches = await Promise.all(
      currentBatch.map(async (currentPath) => {
        if (processedPaths.has(currentPath)) return []; // Skip if already processed
        processedPaths.add(currentPath);

        try {
          await validatePath(currentPath);
          return await fs.readdir(currentPath, { withFileTypes: true });
        } catch (error) {
          return []; // Return empty array on error
        }
      })
    );

    // Flatten and process entries
    for (let i = 0; i < currentBatch.length; i++) {
      const currentPath = currentBatch[i];
      const entries = entriesBatches[i];

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        try {
          // Validate path before processing
          await validatePath(fullPath);

          // Check exclude patterns (once per entry)
          const relativePath = path.relative(rootPath, fullPath);
          if (shouldExclude(relativePath)) {
            continue;
          }

          // Apply the appropriate matcher function
          if (matcher(entry.name, fullPath)) {
            results.push(fullPath);
          }

          // Add directories to queue for next batch
          if (entry.isDirectory()) {
            queue.push(fullPath);
          }
        } catch (error) {
          // Skip invalid paths
          continue;
        }
      }
    }
  }

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
  edits: Array<{ oldText: string, newText: string }>,
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
        name: "search_files_by_name",
        description:
          "Find files and directories whose names match a pattern. Searches recursively " +
          "through all subdirectories from the starting path. Supports glob patterns like '*.txt' " +
          "or '**/*.js' as well as simple substring matching. The search is case-insensitive " +
          "by default unless the pattern contains uppercase characters. Returns full paths to all items with " +
          "matching names. Great for finding files when you don't know their exact location. " +
          "Only searches within allowed directories.",
        inputSchema: zodToJsonSchema(SearchFilesByNameArgsSchema) as ToolInput,
      },
      {
        name: "search_file_contents",
        description:
          "Search for text patterns within file contents. Can search either a single file or " +
          "recursively through a directory. Supports both plain text substring matching and regex patterns. " +
          "The search can be case-sensitive or insensitive based on parameters. Returns matching " +
          "file paths along with line numbers and context lines before/after the match. Only " +
          "searches within allowed directories.",
        inputSchema: zodToJsonSchema(SearchFilesContentArgsSchema) as ToolInput,
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
          const entries = await fs.readdir(validPath, { withFileTypes: true });
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

      case "search_files_by_name": {
        const parsed = SearchFilesByNameArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for search_files_by_name: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const results = await searchFilesByName(validPath, parsed.data.pattern, parsed.data.excludePatterns);
        return {
          content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }],
        };
      }

      case "search_file_contents": {
        const parsed = SearchFilesContentArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for search_file_contents: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const results = await searchFileContents(
          validPath,
          parsed.data.pattern,
          parsed.data.caseSensitive,
          parsed.data.maxResults,
          parsed.data.contextLines,
          parsed.data.excludePatterns,
          parsed.data.includeTypes,
          parsed.data.excludeTypes,
          parsed.data.useRegex
        );
        return {
          content: [{ type: "text", text: results.length > 0 ? results.join("\n\n") : "No matches found" }],
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
          content: [{
            type: "text", text: Object.entries(info)
              .map(([key, value]) => `${key}: ${value}`)
              .join("\n")
          }],
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
