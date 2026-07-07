import { promises as fs, type Stats } from 'fs';
import path from 'path';
import os from 'os';
import { normalizePath } from './path-utils.js';
import type { Root } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from "url";

/**
 * Converts a root URI to normalized directory paths with basic security validation.
 *
 * Returns both the original normalized path and the resolved path when they differ.
 * This keeps roots-provided directories symmetric with command-line directories,
 * so paths addressed through either a symlink/mapped-drive form or its resolved
 * target continue to pass allow-list validation.
 *
 * @param rootUri - File URI (file://...) or plain directory path
 * @returns Promise resolving to validated paths or null if invalid
 */
async function parseRootUri(rootUri: string): Promise<string[] | null> {
  try {
    const rawPath = rootUri.startsWith('file://') ? fileURLToPath(rootUri) : rootUri;
    const expandedPath = rawPath.startsWith('~/') || rawPath === '~'
      ? path.join(os.homedir(), rawPath.slice(1))
      : rawPath;
    const absolutePath = path.resolve(expandedPath);
    const normalizedOriginal = normalizePath(absolutePath);
    const resolvedPath = await fs.realpath(absolutePath);
    const normalizedResolved = normalizePath(resolvedPath);

    return normalizedOriginal === normalizedResolved
      ? [normalizedResolved]
      : [normalizedOriginal, normalizedResolved];
  } catch {
    return null; // Path doesn't exist or other error
  }
}

/**
 * Formats error message for directory validation failures.
 * @param dir - Directory path that failed validation
 * @param error - Error that occurred during validation
 * @param reason - Specific reason for failure
 * @returns Formatted error message
 */
function formatDirectoryError(dir: string, error?: unknown, reason?: string): string {
  if (reason) {
    return `Skipping ${reason}: ${dir}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `Skipping invalid directory: ${dir} due to error: ${message}`;
}

/**
 * Resolves requested root directories from MCP root specifications.
 *
 * Converts root URI specifications (file:// URIs or plain paths) into normalized
 * directory paths, validating that each path exists and is a directory.
 * Includes symlink resolution for security.
 *
 * @param requestedRoots - Array of root specifications with URI and optional name
 * @returns Promise resolving to array of validated directory paths
 */
export async function getValidRootDirectories(
  requestedRoots: readonly Root[]
): Promise<string[]> {
  const validatedDirectories: string[] = [];
  const seenDirectories = new Set<string>();

  for (const requestedRoot of requestedRoots) {
    const candidatePaths = await parseRootUri(requestedRoot.uri);
    if (!candidatePaths) {
      console.error(formatDirectoryError(requestedRoot.uri, undefined, 'invalid path or inaccessible'));
      continue;
    }

    for (const candidatePath of candidatePaths) {
      try {
        const stats: Stats = await fs.stat(candidatePath);
        if (!stats.isDirectory()) {
          console.error(formatDirectoryError(candidatePath, undefined, 'non-directory root'));
          continue;
        }

        if (!seenDirectories.has(candidatePath)) {
          validatedDirectories.push(candidatePath);
          seenDirectories.add(candidatePath);
        }
      } catch (error) {
        console.error(formatDirectoryError(candidatePath, error));
      }
    }
  }

  return validatedDirectories;
}
