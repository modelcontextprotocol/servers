import fs from "fs/promises";
import path from "path";
import os from 'os';
import { randomBytes } from 'crypto';
import { diffLines, createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import { normalizePath, expandHome } from './path-utils.js';
import { isPathWithinAllowedDirectories } from './path-validation.js';

// Resource limits for DoS protection and stability
const MAX_FILE_SIZE_READ = 100 * 1024 * 1024; // 100MB max read
const MAX_FILE_SIZE_WRITE = 50 * 1024 * 1024; // 50MB max write
const MAX_FILES_BATCH_READ = 100; // Max files to read in one batch
const MAX_DIRECTORY_ENTRIES = 10000; // Max directory entries to return
const MAX_SEARCH_RESULTS = 1000; // Max search results
const MAX_PATH_LENGTH = 4096; // Max path length (filesystem limit)

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
  // SECURITY: Validate path length to prevent buffer overflow attacks
  if (requestedPath.length > MAX_PATH_LENGTH) {
    throw new Error(
      `Path length ${requestedPath.length} exceeds maximum allowed length of ${MAX_PATH_LENGTH} characters`
    );
  }

  // SECURITY: Check for null bytes which are forbidden in paths
  if (requestedPath.includes('\0')) {
    throw new Error('Access denied - invalid path: contains null byte');
  }

  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  // Final path length check after resolution
  if (absolute.length > MAX_PATH_LENGTH) {
    throw new Error(
      `Resolved path length ${absolute.length} exceeds maximum allowed length of ${MAX_PATH_LENGTH} characters`
    );
  }

  const normalizedRequested = normalizePath(absolute);

  // Security: Check if path is within allowed directories before any file operations
  const isAllowed = isPathWithinAllowedDirectories(normalizedRequested, allowedDirectories);
  if (!isAllowed) {
    // SECURITY: Sanitize error message to prevent information disclosure
    throw new Error('Access denied - path outside allowed directories');
  }

  // Security: Handle symlinks by checking their real path to prevent symlink attacks
  // This prevents attackers from creating symlinks that point outside allowed directories
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    if (!isPathWithinAllowedDirectories(normalizedReal, allowedDirectories)) {
      // SECURITY: Sanitize error message to prevent information disclosure
      throw new Error('Access denied - symlink target outside allowed directories');
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
          // SECURITY: Sanitize error message to prevent information disclosure
          throw new Error('Access denied - parent directory outside allowed directories');
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
  // SECURITY: Check file size before reading to prevent OOM
  try {
    const stats = await fs.stat(filePath);
    if (stats && stats.size > MAX_FILE_SIZE_READ) {
      throw new Error(
        `File size ${stats.size} bytes exceeds maximum read size of ${MAX_FILE_SIZE_READ} bytes ` +
        `(${Math.round(MAX_FILE_SIZE_READ / 1024 / 1024)}MB). ` +
        `Use head/tail operations for large files.`
      );
    }
  } catch (error) {
    // If stat fails, let readFile handle the error (file might not exist, etc.)
    if ((error as any).message && (error as any).message.includes('exceeds maximum')) {
      throw error; // Re-throw size limit errors
    }
    // Otherwise, continue to readFile which will provide appropriate error
  }

  return await fs.readFile(filePath, encoding as BufferEncoding);
}

export async function writeFileContent(filePath: string, content: string): Promise<void> {
  // SECURITY: Check content size before writing to prevent disk exhaustion
  const contentSize = Buffer.byteLength(content, 'utf-8');
  if (contentSize > MAX_FILE_SIZE_WRITE) {
    throw new Error(
      `Content size ${contentSize} bytes exceeds maximum write size of ${MAX_FILE_SIZE_WRITE} bytes ` +
      `(${Math.round(MAX_FILE_SIZE_WRITE / 1024 / 1024)}MB)`
    );
  }

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
  // SECURITY: Check file size before reading to prevent OOM
  try {
    const stats = await fs.stat(filePath);
    if (stats && stats.size > MAX_FILE_SIZE_READ) {
      throw new Error(
        `File size ${stats.size} bytes exceeds maximum read size of ${MAX_FILE_SIZE_READ} bytes ` +
        `(${Math.round(MAX_FILE_SIZE_READ / 1024 / 1024)}MB). ` +
        `Cannot apply edits to files this large.`
      );
    }
  } catch (error) {
    if ((error as any).message && (error as any).message.includes('exceeds maximum')) {
      throw error; // Re-throw size limit errors
    }
    // Otherwise, continue to readFile which will provide appropriate error
  }

  // Read file content and normalize line endings
  const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));

  // Apply edits sequentially
  let modifiedContent = content;
  for (const edit of edits) {
    const normalizedOld = normalizeLineEndings(edit.oldText);
    const normalizedNew = normalizeLineEndings(edit.newText);

    // If exact match exists, use it
    if (modifiedContent.includes(normalizedOld)) {
      // SECURITY FIX: Use replaceAll() to replace ALL occurrences, not just the first one
      // This prevents incomplete updates (e.g., replacing only first occurrence of a secret key)
      modifiedContent = modifiedContent.replaceAll(normalizedOld, normalizedNew);
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
  // SECURITY: Check file size before processing to prevent OOM
  const stats = await fs.stat(filePath);
  const fileSize = stats?.size || 0;

  // Handle empty files early
  if (fileSize === 0) return '';

  if (fileSize > MAX_FILE_SIZE_READ) {
    throw new Error(
      `File size ${fileSize} bytes exceeds maximum read size of ${MAX_FILE_SIZE_READ} bytes ` +
      `(${Math.round(MAX_FILE_SIZE_READ / 1024 / 1024)}MB). ` +
      `Cannot tail files this large.`
    );
  }

  const CHUNK_SIZE = 1024; // Read 1KB at a time

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
  // SECURITY: Check file size before processing to prevent OOM
  const stats = await fs.stat(filePath);
  if (stats && stats.size && stats.size > MAX_FILE_SIZE_READ) {
    throw new Error(
      `File size ${stats.size} bytes exceeds maximum read size of ${MAX_FILE_SIZE_READ} bytes ` +
      `(${Math.round(MAX_FILE_SIZE_READ / 1024 / 1024)}MB). ` +
      `Cannot head files this large.`
    );
  }

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

export async function searchFilesWithValidation(
  rootPath: string,
  pattern: string,
  allowedDirectories: string[],
  options: SearchOptions = {}
): Promise<string[]> {
  const { excludePatterns = [] } = options;
  const results: string[] = [];

  async function search(currentPath: string) {
    // SECURITY: Stop early if we've reached the result limit to prevent resource exhaustion
    if (results.length >= MAX_SEARCH_RESULTS) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    // SECURITY: Check directory entry count to prevent DoS from directories with millions of files
    if (entries.length > MAX_DIRECTORY_ENTRIES) {
      throw new Error(
        `Directory ${currentPath} contains ${entries.length} entries, ` +
        `exceeding maximum of ${MAX_DIRECTORY_ENTRIES}. ` +
        `This may indicate a DoS attempt or misconfiguration.`
      );
    }

    for (const entry of entries) {
      // Stop early if we've reached the result limit
      if (results.length >= MAX_SEARCH_RESULTS) {
        return;
      }

      const fullPath = path.join(currentPath, entry.name);

      try {
        await validatePath(fullPath);

        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some(excludePattern =>
          minimatch(relativePath, excludePattern, { dot: true })
        );

        if (shouldExclude) continue;

        // Use glob matching for the search pattern
        if (minimatch(relativePath, pattern, { dot: true })) {
          results.push(fullPath);
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch {
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}
