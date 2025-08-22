import fs from "fs/promises";
import { Dirent } from "fs";
import path from "path";
import os from 'os';
import { randomBytes } from 'crypto';
import { diffLines, createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import { normalizePath, expandHome } from './path-utils.js';
import { isPathWithinAllowedDirectories } from './path-validation.js';

// Global allowed directories - set by the main module
let allowedDirectories: string[] = [];

// Function to set allowed directories from the main module
export function setAllowedDirectories(directories: string[]): void {
  allowedDirectories = [...directories];
}

// Function to get current allowed directories
export function getAllowedDirectories(): string[] {
  return [...allowedDirectories];
}

// Type definitions
interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

export interface SearchOptions {
  excludePatterns?: string[];
}

export interface SearchResult {
  path: string;
  isDirectory: boolean;
}

// Pure Utility Functions
export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  if (i < 0 || i === 0) return `${bytes} ${units[0]}`;
  
  const unitIndex = Math.min(i, units.length - 1);
  return `${(bytes / Math.pow(1024, unitIndex)).toFixed(2)} ${units[unitIndex]}`;
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export function createUnifiedDiff(originalContent: string, newContent: string, filepath: string = 'file'): string {
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

// Security & Validation Functions
export async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  const normalizedRequested = normalizePath(absolute);

  // Security: Check if path is within allowed directories before any file operations
  const isAllowed = isPathWithinAllowedDirectories(normalizedRequested, allowedDirectories);
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Security: Handle symlinks by checking their real path to prevent symlink attacks
  // This prevents attackers from creating symlinks that point outside allowed directories
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    if (!isPathWithinAllowedDirectories(normalizedReal, allowedDirectories)) {
      throw new Error(`Access denied - symlink target outside allowed directories: ${realPath} not in ${allowedDirectories.join(', ')}`);
    }
    return realPath;
  } catch (error) {
    // Security: For new files that don't exist yet, verify parent directory
    // This ensures we can't create files in unauthorized locations
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


// File Operations
export async function getFileStats(filePath: string): Promise<FileInfo> {
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

export async function readFileContent(filePath: string, encoding: string = 'utf-8'): Promise<string> {
  return await fs.readFile(filePath, encoding as BufferEncoding);
}

export async function writeFileContent(filePath: string, content: string): Promise<void> {
  try {
    // Security: 'wx' flag ensures exclusive creation - fails if file/symlink exists,
    // preventing writes through pre-existing symlinks
    await fs.writeFile(filePath, content, { encoding: "utf-8", flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      // Security: Use atomic rename to prevent race conditions where symlinks
      // could be created between validation and write. Rename operations
      // replace the target file atomically and don't follow symlinks.
      const tempPath = `${filePath}.${randomBytes(16).toString('hex')}.tmp`;
      try {
        await fs.writeFile(tempPath, content, 'utf-8');
        await fs.rename(tempPath, filePath);
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
}


// File Editing Functions
interface FileEdit {
  oldText: string;
  newText: string;
}

export async function applyFileEdits(
  filePath: string,
  edits: FileEdit[],
  dryRun: boolean = false
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

// Memory-efficient implementation to get the last N lines of a file
export async function tailFile(filePath: string, numLines: number): Promise<string> {
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
export async function headFile(filePath: string, numLines: number): Promise<string> {
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

// Search by name function with glob pattern support
export async function searchFilesByName(
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

  const compiledExcludes = excludePatterns.map(pattern => {
    const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
    return (path: string) => minimatch(path, globPattern, { dot: true });
  });

  const shouldExclude = (relativePath: string): boolean => {
    return compiledExcludes.some(matchFn => matchFn(relativePath));
  };

  // Process directories in a breadth-first manner
  while (queue.length > 0) {
    const currentBatch = [...queue]; // Copy current queue for parallel processing
    queue.length = 0; // Clear queue for next batch

    // Process current batch in parallel
    const entriesBatches = await Promise.all(
      currentBatch.map(async (currentPath): Promise<Dirent[]> => {
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

      if (!entries) continue;

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

// Legacy function for backward compatibility
export async function searchFilesWithValidation(
  rootPath: string,
  pattern: string,
  allowedDirectories: string[],
  options: SearchOptions = {}
): Promise<string[]> {
  const { excludePatterns = [] } = options;
  return searchFilesByName(rootPath, pattern, excludePatterns);
}

// Search within file contents (grep-like functionality)
export async function searchFileContents(
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

  const compiledExcludes = excludePatterns.map(pattern => {
    return (path: string) => minimatch(path, pattern, {
      dot: true,
      nocase: !caseSensitive,  // Make case sensitivity consistent with the search
      matchBase: !pattern.includes('/') // Match basename if no path separators
    });
  });

  const compiledIncludes = includePatterns.map(pattern => {
    return (filePath: string) => minimatch(filePath, pattern, {
      dot: true,
      nocase: !caseSensitive,  // Make case sensitivity consistent with the search
      matchBase: !pattern.includes('/') // Match basename if no path separators
    });
  });

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
