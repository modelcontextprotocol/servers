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

// ---------------------------------------------------------------------------
// Mitigations for issue #4162: recursive search / validatePath can hang for
// minutes on macOS CloudStorage / lazy provider-backed paths, because
// fs.realpath and fs.readdir have no timeout and recursive search has no
// upper bound. All knobs below are env-var configurable and default to
// behavior that is safe for ordinary local trees.
//
//   FS_OP_TIMEOUT_MS            timeout (ms) per fs.realpath / fs.readdir
//                               call. Default 15000. Positive integer.
//   FS_SEARCH_MAX_VISITED       max entries a single recursive search may
//                               visit before aborting. Default 50000.
//                               Positive integer.
//   FS_SEARCH_EXCLUDE_PREFIXES  comma-separated path prefixes that recursive
//                               search refuses outright. Empty by default
//                               (no behavior change). '~' is expanded.
//
// Invalid numeric values are ignored (a warning is logged) and the default is
// used, so a typo cannot silently disable a guard.
// ---------------------------------------------------------------------------

// Raised when a wrapped filesystem call exceeds FS_OP_TIMEOUT_MS. Distinct
// from ordinary fs errors so callers can tell a hang apart from e.g. EACCES
// and avoid silently swallowing it.
export class FsTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FsTimeoutError';
  }
}

// Raised when a recursive search / directory walk reaches FS_SEARCH_MAX_VISITED.
// A safety-cap abort is a deliberate early exit, not a genuine empty result, so
// it gets its own type (mirroring FsTimeoutError) -- callers can discriminate it
// via instanceof rather than string-matching the message, and it carries the
// visit count and cap for diagnostics.
export class FsSearchTruncatedError extends Error {
  constructor(
    message: string,
    public readonly visited: number,
    public readonly maxVisited: number,
  ) {
    super(message);
    this.name = 'FsSearchTruncatedError';
  }
}

// Reads a positive-integer env var, falling back to `defaultValue` (with a
// warning) when unset or invalid. Uses Number() rather than parseInt() so that
// partially-numeric garbage such as "15s" is rejected instead of truncated.
function readPositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error(`[filesystem] Ignoring invalid ${name}="${raw}"; using default ${defaultValue}.`);
    return defaultValue;
  }
  return parsed;
}

// Timeout (ms) applied to individual fs.realpath / fs.readdir calls.
const FS_OP_TIMEOUT_MS = readPositiveIntEnv('FS_OP_TIMEOUT_MS', 15000);

// Hard cap on entries visited by a single recursive search before it aborts.
export const FS_SEARCH_MAX_VISITED = readPositiveIntEnv('FS_SEARCH_MAX_VISITED', 50000);

// Opt-in: comma-separated path prefixes that recursive search refuses outright.
// Empty by default -- no behavior change unless the user sets it. Intended for
// known-slow provider-backed roots (e.g. a CloudStorage folder). Each entry is
// expanded ('~') and normalized so the containment check below is boundary-
// aware: "/data/foo" must not match an unrelated "/data/foobar" root.
const FS_SEARCH_EXCLUDE_PREFIXES = (process.env.FS_SEARCH_EXCLUDE_PREFIXES ?? '')
  .split(',')
  .map(prefix => prefix.trim())
  .filter(prefix => prefix.length > 0)
  .map(prefix => normalizePath(path.resolve(expandHome(prefix))));

// Races a filesystem promise against a timeout. On timeout it rejects with an
// FsTimeoutError instead of letting the caller hang. Note: the underlying fs
// operation cannot be cancelled and may still settle in the background; the
// timeout only unblocks the caller.
export async function withFsTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new FsTimeoutError(`Filesystem operation timed out after ${FS_OP_TIMEOUT_MS}ms: ${label}`)),
      FS_OP_TIMEOUT_MS,
    );
  });
  // Defensive: if the operation wins the race, the timeout promise is left
  // unhandled. Attach a no-op catch so the eventual rejection (if the timer
  // does fire before clearTimeout takes effect) isn't reported as an
  // unhandled rejection. The race result is unaffected.
  timeout.catch(() => {});
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer!);
  }
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

  // Security: Handle symlinks by checking their real path to prevent symlink attacks
  // This prevents attackers from creating symlinks that point outside allowed directories
  // #4162: fs.realpath is wrapped with a timeout so a lazy provider-backed path
  // cannot block validation indefinitely.
  try {
    const realPath = await withFsTimeout(fs.realpath(absolute), `realpath ${absolute}`);
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
      // #4162: only the realpath call is inside this try, so a timeout
      // surfaces as FsTimeoutError and the access-denied check below is not
      // masked into a misleading "Parent directory does not exist".
      let realParentPath: string;
      try {
        realParentPath = await withFsTimeout(fs.realpath(parentDir), `realpath ${parentDir}`);
      } catch (parentError) {
        if (parentError instanceof FsTimeoutError) throw parentError;
        throw new Error(`Parent directory does not exist: ${parentDir}`);
      }
      const normalizedParent = normalizePath(realParentPath);
      if (!isPathWithinAllowedDirectories(normalizedParent, allowedDirectories)) {
        throw new Error(`Access denied - parent directory outside allowed directories: ${realParentPath} not in ${allowedDirectories.join(', ')}`);
      }
      return absolute;
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

// #4162: refuse recursive operations outright on user-configured slow roots.
// Exported so both searchFilesWithValidation here and the directory_tree handler
// in index.ts share the same containment check -- containment reuses
// isPathWithinAllowedDirectories so it is boundary-aware: a prefix cannot match
// an unrelated sibling that merely shares a string head.
export function assertSearchPathNotExcluded(rootPath: string, opName: string): void {
  if (FS_SEARCH_EXCLUDE_PREFIXES.length === 0) return;
  // FS_SEARCH_EXCLUDE_PREFIXES is expanded with expandHome at module load
  // (see above), so apply the same to rootPath here for symmetric comparison.
  const normalizedRoot = normalizePath(path.resolve(expandHome(rootPath)));
  if (isPathWithinAllowedDirectories(normalizedRoot, FS_SEARCH_EXCLUDE_PREFIXES)) {
    throw new Error(
      `${opName} is disabled for this path by FS_SEARCH_EXCLUDE_PREFIXES: ${rootPath}. ` +
      `Recursive operations over lazy provider-backed trees (macOS CloudStorage / FileProvider) ` +
      `are unreliable; use list_directory on specific subfolders, or narrow the search root.`
    );
  }
}

export async function searchFilesWithValidation(
  rootPath: string,
  pattern: string,
  allowedDirectories: string[],
  options: SearchOptions = {}
): Promise<string[]> {
  assertSearchPathNotExcluded(rootPath, 'Recursive search');

  const { excludePatterns = [] } = options;
  const results: string[] = [];
  // #4162: bound the recursion so a large / lazy-materialized tree cannot keep
  // the server busy indefinitely. The search aborts once FS_SEARCH_MAX_VISITED
  // entries have been visited; `aborted` is checked at every re-entry.
  let visited = 0;
  let aborted = false;

  async function search(currentPath: string) {
    if (aborted) return;
    // #4162: fs.readdir is wrapped with a timeout. A timeout (FsTimeoutError)
    // propagates to the caller from any depth: the per-entry catch below
    // deliberately re-throws timeouts instead of swallowing them, so a search
    // never returns silently-partial results.
    const entries = await withFsTimeout(
      fs.readdir(currentPath, { withFileTypes: true }),
      `readdir ${currentPath}`,
    );

    for (const entry of entries) {
      if (aborted) return;
      if (visited >= FS_SEARCH_MAX_VISITED) {
        aborted = true;
        return;
      }
      visited++;

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
          if (aborted) return;
        }
      } catch (error) {
        // #4162: a timeout is a real hang, not an inaccessible entry -- surface
        // it instead of continuing with partial results.
        if (error instanceof FsTimeoutError) throw error;
        continue;
      }
    }
  }

  await search(rootPath);
  if (aborted) {
    throw new FsSearchTruncatedError(
      `Search aborted after visiting ${visited} entries ` +
      `(cap FS_SEARCH_MAX_VISITED=${FS_SEARCH_MAX_VISITED}). ` +
      `Refine the pattern (e.g. '**/name') or narrow the search path.`,
      visited,
      FS_SEARCH_MAX_VISITED,
    );
  }
  return results;
}
