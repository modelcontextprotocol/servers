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
import { createReadStream } from "fs";
import path from "path";
import os from 'os';
import { randomBytes } from 'crypto';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { diffLines, createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import { isPathWithinAllowedDirectories } from './path-validation.js';
import { getValidRootDirectories } from './roots-utils.js';

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-server-filesystem [allowed-directory] [additional-directories...]");
  console.error("Note: Allowed directories can be provided via:");
  console.error("  1. Command-line arguments (shown above)");
  console.error("  2. MCP roots protocol (if client supports it)");
  console.error("At least one directory must be provided by EITHER method for the server to operate.");
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
  const isAllowed = isPathWithinAllowedDirectories(normalizedRequested, allowedDirectories);
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    if (!isPathWithinAllowedDirectories(normalizedReal, allowedDirectories)) {
      throw new Error(`Access denied - symlink target outside allowed directories: ${realPath} not in ${allowedDirectories.join(', ')}`);
    }
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const parentDir = path.dirname(absolute);
      try {
        const realParentPath = await fs.realpath(parentDir);
        const normalizedParent = normalizePath(realParentPath);
        if (!isPathWithinAllowedDirectories(normalizedParent, allowedDirectories)) {
          throw new Error(`Access denied - parent directory outside allowed directories: ${realParentPath} not in ${allowedDirectories.join(', ')}`);
        }
        return absolute;
      } catch {
        throw new Error(`Parent directory does not exist: ${parentDir}`);
      }
    }
    throw error;
  }
}

// Schema definitions
const ReadTextFileArgsSchema = z.object({
  path: z.string(),
  tail: z.number().optional().describe('If provided, returns only the last N lines of the file'),
  head: z.number().optional().describe('If provided, returns only the first N lines of the file')
});

const ReadMediaFileArgsSchema = z.object({
  path: z.string()
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

const SearchFilesByNameArgsSchema = z.object({
  path: z.string().describe('The root directory path to start the search from'),
  pattern: z.string().describe('Pattern to match within file/directory names. Supports glob patterns. ' +
    'Case insensitive unless pattern contains uppercase characters'),
  excludePatterns: z.array(z.string())
    .optional()
    .default([])
    .describe('Glob patterns for paths to exclude from search (e.g., "node_modules/**")')
});

const SearchFilesContentArgsSchema = z.object({
  path: z.string().describe('Path to search - can be a file path or a directory to search recursively'),
  searchText: z.string().describe('Text to search for - supports plain text substring matching or regex if useRegex is true'),
  useRegex: z.boolean()
    .optional()
    .default(false)
    .describe('When false (default), performs simple text matching. When true, interprets searchText as a regular expression'),
  caseSensitive: z.boolean()
    .optional()
    .default(false)
    .describe('When true, perform case-sensitive matching'),
  maxResults: z.number()
    .optional()
    .default(100)
    .describe('Maximum number of matching results to return'),
  contextLines: z.number()
    .optional()
    .default(2)
    .describe('Number of lines to show before and after each match'),
  includePatterns: z.array(z.string())
    .optional()
    .default([])
    .describe('Glob patterns for paths to include in search (e.g., ["**/*.js", "**/*.ts"])'),
  excludePatterns: z.array(z.string())
    .optional()
    .default([])
    .describe('Glob patterns for paths to exclude from search (e.g., ["node_modules/**", "*.test.ts"])')
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
  searchText: string,
  useRegex: boolean = false,
  caseSensitive: boolean = false,
  maxResults: number = 100,
  contextLines: number = 2,
  includePatterns: string[] = [],
  excludePatterns: string[] = [],
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
      searchPattern = new RegExp(searchText, (caseSensitive ? '' : 'i') + 'm');
    } catch (error: any) {
      throw new Error(`Invalid regex pattern: ${error.message || String(error)}`);
    }
  } else {
    searchPattern = caseSensitive ? searchText : searchText.toLowerCase();
  }

  // Pre-compile exclude patterns
  const compiledExcludes = excludePatterns.map(pattern => {
    return (path: string) => minimatch(path, pattern, {
      dot: true,
      nocase: !caseSensitive,  // Make case sensitivity consistent with the search
      matchBase: !pattern.includes('/') // Match basename if no path separators
    });
  });

  // Pre-compile include patterns
  const compiledIncludes = includePatterns.map(pattern => {
    return (filePath: string) => minimatch(filePath, pattern, {
      dot: true,
      nocase: !caseSensitive,  // Make case sensitivity consistent with the search
      matchBase: !pattern.includes('/') // Match basename if no path separators
    });
  });

  // Function to check if a file should be processed based on include/exclude patterns
  const shouldProcessFile = (relativePath: string): boolean => {
    // If there are exclude patterns and the path matches any, skip this file
    if (excludePatterns.length > 0 && shouldExclude(relativePath)) {
      return false;
    }
    // If there are include patterns, file must match at least one
    if (includePatterns.length > 0) {
      return compiledIncludes.some(matchFn => matchFn(relativePath));
    }
    // If no include patterns specified, include all files not excluded
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
    // For single files, we don't apply include/exclude patterns
    const fileResults = await searchTextFile(rootPath);
    return fileResults;
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
              } else if (entry.isFile() && shouldProcessFile(relativePath)) {
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
    // Security: Use atomic rename to prevent race conditions where symlinks
    // could be created between validation and write. Rename operations
    // replace the target file atomically and don't follow symlinks.
    const tempPath = `${filePath}.${randomBytes(16).toString('hex')}.tmp`;
    try {
      await fs.writeFile(tempPath, modifiedContent, 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw error;
    }
  }

  return formattedDiff;
}

// Helper functions
function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';

  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i === 0) return `${bytes} ${units[i]}`;

  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

// Memory-efficient implementation to get the last N lines of a file
async function tailFile(filePath: string, numLines: number): Promise<string> {
  const CHUNK_SIZE = 1024; // Read 1KB at a time
  const stats = await fs.stat(filePath);
  const fileSize = stats.size;

  if (fileSize === 0) return '';

  // Open file for reading
  const fileHandle = await fs.open(filePath, 'r');
  try {
    const lines: string[] = [];
    let position = fileSize;
    let chunk = Buffer.alloc(CHUNK_SIZE);
    let linesFound = 0;
    let remainingText = '';

    // Read chunks from the end of the file until we have enough lines
    while (position > 0 && linesFound < numLines) {
      const size = Math.min(CHUNK_SIZE, position);
      position -= size;

      const { bytesRead } = await fileHandle.read(chunk, 0, size, position);
      if (!bytesRead) break;

      // Get the chunk as a string and prepend any remaining text from previous iteration
      const readData = chunk.slice(0, bytesRead).toString('utf-8');
      const chunkText = readData + remainingText;

      // Split by newlines and count
      const chunkLines = normalizeLineEndings(chunkText).split('\n');

      // If this isn't the end of the file, the first line is likely incomplete
      // Save it to prepend to the next chunk
      if (position > 0) {
        remainingText = chunkLines[0];
        chunkLines.shift(); // Remove the first (incomplete) line
      }

      // Add lines to our result (up to the number we need)
      for (let i = chunkLines.length - 1; i >= 0 && linesFound < numLines; i--) {
        lines.unshift(chunkLines[i]);
        linesFound++;
      }
    }

    return lines.join('\n');
  } finally {
    await fileHandle.close();
  }
}

// New function to get the first N lines of a file
async function headFile(filePath: string, numLines: number): Promise<string> {
  const fileHandle = await fs.open(filePath, 'r');
  try {
    const lines: string[] = [];
    let buffer = '';
    let bytesRead = 0;
    const chunk = Buffer.alloc(1024); // 1KB buffer

    // Read chunks and count lines until we have enough or reach EOF
    while (lines.length < numLines) {
      const result = await fileHandle.read(chunk, 0, chunk.length, bytesRead);
      if (result.bytesRead === 0) break; // End of file
      bytesRead += result.bytesRead;
      buffer += chunk.slice(0, result.bytesRead).toString('utf-8');

      const newLineIndex = buffer.lastIndexOf('\n');
      if (newLineIndex !== -1) {
        const completeLines = buffer.slice(0, newLineIndex).split('\n');
        buffer = buffer.slice(newLineIndex + 1);
        for (const line of completeLines) {
          lines.push(line);
          if (lines.length >= numLines) break;
        }
      }
    }

    // If there is leftover content and we still need lines, add it
    if (buffer.length > 0 && lines.length < numLines) {
      lines.push(buffer);
    }

    return lines.join('\n');
  } finally {
    await fileHandle.close();
  }
}

// Reads a file as a stream of buffers, concatenates them, and then encodes
// the result to a Base64 string. This is a memory-efficient way to handle
// binary data from a stream before the final encoding.
async function readFileAsBase64Stream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => {
      chunks.push(chunk as Buffer);
    });
    stream.on('end', () => {
      const finalBuffer = Buffer.concat(chunks);
      resolve(finalBuffer.toString('base64'));
    });
    stream.on('error', (err) => reject(err));
  });
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_file",
        description: "Read the complete contents of a file as text. DEPRECATED: Use read_text_file instead.",
        inputSchema: zodToJsonSchema(ReadTextFileArgsSchema) as ToolInput,
      },
      {
        name: "read_text_file",
        description:
          "Read the complete contents of a file from the file system as text. " +
          "Handles various text encodings and provides detailed error messages " +
          "if the file cannot be read. Use this tool when you need to examine " +
          "the contents of a single file. Use the 'head' parameter to read only " +
          "the first N lines of a file, or the 'tail' parameter to read only " +
          "the last N lines of a file. Operates on the file as text regardless of extension. " +
          "Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadTextFileArgsSchema) as ToolInput,
      },
      {
        name: "read_media_file",
        description:
          "Read an image or audio file. Returns the base64 encoded data and MIME type. " +
          "Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadMediaFileArgsSchema) as ToolInput,
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
      case "read_file":
      case "read_text_file": {
        const parsed = ReadTextFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_text_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);

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

        const content = await fs.readFile(validPath, "utf-8");
        return {
          content: [{ type: "text", text: content }],
        };
      }

      case "read_media_file": {
        const parsed = ReadMediaFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_media_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const extension = path.extname(validPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".bmp": "image/bmp",
          ".svg": "image/svg+xml",
          ".mp3": "audio/mpeg",
          ".wav": "audio/wav",
          ".ogg": "audio/ogg",
          ".flac": "audio/flac",
        };
        const mimeType = mimeTypes[extension] || "application/octet-stream";
        const data = await readFileAsBase64Stream(validPath);
        const type = mimeType.startsWith("image/")
          ? "image"
          : mimeType.startsWith("audio/")
            ? "audio"
            : "blob";
        return {
          content: [{ type, data, mimeType }],
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

        try {
          // Security: 'wx' flag ensures exclusive creation - fails if file/symlink exists,
          // preventing writes through pre-existing symlinks
          await fs.writeFile(validPath, parsed.data.content, { encoding: "utf-8", flag: 'wx' });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            // Security: Use atomic rename to prevent race conditions where symlinks
            // could be created between validation and write. Rename operations
            // replace the target file atomically and don't follow symlinks.
            const tempPath = `${validPath}.${randomBytes(16).toString('hex')}.tmp`;
            try {
              await fs.writeFile(tempPath, parsed.data.content, 'utf-8');
              await fs.rename(tempPath, validPath);
            } catch (renameError) {
              try {
                await fs.unlink(tempPath);
              } catch {}
              throw renameError;
            }
          } else {
            throw error;
          }
        }

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

      case "list_directory_with_sizes": {
        const parsed = ListDirectoryWithSizesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory_with_sizes: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
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
          parsed.data.searchText,
          parsed.data.useRegex,
          parsed.data.caseSensitive,
          parsed.data.maxResults,
          parsed.data.contextLines,
          parsed.data.includePatterns,
          parsed.data.excludePatterns,
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
