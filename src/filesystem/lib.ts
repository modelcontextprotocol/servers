import fs from "fs/promises";
import path from "path";
import os from 'os';
import { randomBytes } from 'crypto';
import { diffLines, createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import { normalizePath, expandHome } from './path-utils.js';
import { isPathWithinAllowedDirectories } from './path-validation.js';

// Global allowed directories - set by the main module
let allowedDirectories: string[] = [];

// Symlink policy settings
let followSymlinks = false;
let symlinkMaxDepth = 1;

// Interface for symlink policy configuration
export interface SymlinkPolicy {
  follow: boolean;
  maxDepth: number;
}

// Export function to set symlink policy from index.ts
export function setSymlinkPolicy(policy: SymlinkPolicy): void {
  followSymlinks = policy.follow;
  symlinkMaxDepth = policy.maxDepth;
}

// Export function to get current symlink policy
export function getSymlinkPolicy(): SymlinkPolicy {
  return { follow: followSymlinks, maxDepth: symlinkMaxDepth };
}


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

// Helper function to resolve relative paths against allowed directories
function resolveRelativePathAgainstAllowedDirectories(relativePath: string): string {
  if (allowedDirectories.length === 0) {
    // Fallback to process.cwd() if no allowed directories are set
    return path.resolve(process.cwd(), relativePath);
  }

  // Try to resolve relative path against each allowed directory
  for (const allowedDir of allowedDirectories) {
    const candidate = path.resolve(allowedDir, relativePath);
    const normalizedCandidate = normalizePath(candidate);
    
    // Check if the resulting path lies within any allowed directory
    if (isPathWithinAllowedDirectories(normalizedCandidate, allowedDirectories)) {
      return candidate;
    }
  }
  
  // If no valid resolution found, use the first allowed directory as base
  // This provides a consistent fallback behavior
  return path.resolve(allowedDirectories[0], relativePath);
}

// Security & Validation Functions

/**
 * Resolves a symlink path hop-by-hop, counting how many hops land outside allowed directories.
 * @param currentPath - The current path to resolve
 * @returns Tuple of [resolvedPath, hopsOutsideAllowed]
 */
async function resolveSymlinkHopByHop(currentPath: string): Promise<[string, number]> {
  let symlinkPath = currentPath;
  let hopsOutsideAllowed = 0;
  const visited = new Set<string>();

  while (true) {
    // Prevent infinite loops from circular symlinks
    const normalizedCurrent = normalizePath(symlinkPath);
    if (visited.has(normalizedCurrent)) {
      throw new Error(`Access denied - circular symlink detected: ${currentPath}`);
    }
    visited.add(normalizedCurrent);

    try {
      const stats = await fs.lstat(symlinkPath);
      
      if (!stats.isSymbolicLink()) {
        // Not a symlink - we've reached the final target
        return [symlinkPath, hopsOutsideAllowed];
      }

      // It's a symlink - read the target
      const target = await fs.readlink(symlinkPath);
      
      // Resolve relative symlinks relative to the directory containing the symlink
      const resolvedTarget = path.isAbsolute(target)
        ? path.resolve(target)
        : path.resolve(path.dirname(symlinkPath), target);
      
      const normalizedResolved = normalizePath(resolvedTarget);
      
      // Check if this hop lands outside allowed directories
      const isOutside = !isPathWithinAllowedDirectories(normalizedResolved, allowedDirectories);
      if (isOutside) {
        hopsOutsideAllowed++;
      }

      // Move to next hop
      symlinkPath = resolvedTarget;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Path doesn't exist - could be a new file, return current path
        return [symlinkPath, hopsOutsideAllowed];
      }
      throw error;
    }
  }
}

export async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : resolveRelativePathAgainstAllowedDirectories(expandedPath);

  const normalizedRequested = normalizePath(absolute);

  // Security: Check if path is within allowed directories before any file operations
  const isAllowed = isPathWithinAllowedDirectories(normalizedRequested, allowedDirectories);
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  try {
    // Get file stats to check if it's a symlink
    // Use optional chaining to handle test mocks where stats might be undefined
    const stats = await fs.lstat(absolute);
    
    if (!stats?.isSymbolicLink()) {
      // Not a symlink - perform existing realpath validation for safety
      // First, get the resolved path considering potential symlinks in the allowed dirs themselves
      // This handles macOS /var -> /private/var and similar cases
      let realPath: string;
      try {
        realPath = await fs.realpath(absolute);
      } catch (realpathErr) {
        if ((realpathErr as NodeJS.ErrnoException).code === 'ENOENT') {
          throw realpathErr; // Let outer ENOENT handler deal with parent dir check
        }
        realPath = absolute;
      }
      const normalizedReal = normalizePath(realPath);
      
      // Also get resolved path of the absolute itself for comparison
      let resolvedAbsolute = absolute;
      try {
        resolvedAbsolute = await fs.realpath(absolute);
      } catch (realpathErr2) {
        if ((realpathErr2 as NodeJS.ErrnoException).code === 'ENOENT') {
          throw realpathErr2; // Let outer ENOENT handler deal with parent dir check
        }
        // If realpath fails for other reasons, use the original path
      }
      const normalizedResolved = normalizePath(resolvedAbsolute);
      
      if (!isPathWithinAllowedDirectories(normalizedReal, allowedDirectories) && 
          !isPathWithinAllowedDirectories(normalizedResolved, allowedDirectories)) {
        throw new Error(`Access denied - path outside allowed directories: ${realPath} not in ${allowedDirectories.join(', ')}`);
      }
      return realPath || absolute;
    }

    // It's a symlink - check if symlink following is enabled
    if (!followSymlinks) {
      // Original behavior: resolve fully and check
      const realPath = await fs.realpath(absolute);
      const normalizedReal = normalizePath(realPath);
      if (!isPathWithinAllowedDirectories(normalizedReal, allowedDirectories)) {
        throw new Error(`Access denied - symlink target outside allowed directories: ${realPath} not in ${allowedDirectories.join(', ')}`);
      }
      return realPath;
    }

    // Symlink following is enabled - resolve hop-by-hop with depth limit
    const [resolvedPath, hopsOutsideAllowed] = await resolveSymlinkHopByHop(absolute);
    
    if (hopsOutsideAllowed > symlinkMaxDepth) {
      throw new Error(`Access denied - symlink chain exceeded max depth of ${symlinkMaxDepth} outside allowed directories`);
    }
    
    return resolvedPath;
  } catch (error) {
    // Re-throw already-formatted access denied / custom errors directly
    if (error instanceof Error && !(error as NodeJS.ErrnoException).code) {
      throw error;
    }
    // Security: For new files that don't exist yet, verify parent directory
    // This ensures we can't create files in unauthorized locations
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const parentDir = path.dirname(absolute);
      try {
        // Also get resolved parent for macOS /var -> /private/var case
        let realParentPath: string;
        try {
          realParentPath = await fs.realpath(parentDir);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Parent directory does not exist: ${parentDir}`);
          }
          throw err;
        }
        
        // Check both resolved and original parent paths
        const normalizedParent = normalizePath(realParentPath);
        if (!isPathWithinAllowedDirectories(normalizedParent, allowedDirectories)) {
          // Also check if the immediate parent exists and is accessible
          try {
            const stats = await fs.lstat(parentDir);
            // Parent exists but resolved path is outside - check if original is allowed
            if (!isPathWithinAllowedDirectories(normalizePath(parentDir), allowedDirectories)) {
              throw new Error(`Access denied - parent directory outside allowed directories: ${realParentPath} not in ${allowedDirectories.join(', ')}`);
            }
          } catch (lstatErr) {
            // Re-throw formatted errors directly
            if (lstatErr instanceof Error && !(lstatErr as NodeJS.ErrnoException).code) {
              throw lstatErr;
            }
            throw new Error(`Access denied - parent directory outside allowed directories: ${realParentPath} not in ${allowedDirectories.join(', ')}`);
          }
        }
        return absolute;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`Parent directory does not exist: ${parentDir}`);
        }
        throw err;
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

export async function searchFilesWithValidation(
  rootPath: string,
  pattern: string,
  allowedDirectories: string[],
  options: SearchOptions = {}
): Promise<string[]> {
  const { excludePatterns = [] } = options;
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
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
