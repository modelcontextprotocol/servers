import { promises as fs, type Stats } from 'fs';
import path from 'path';
import { normalizePath } from './path-utils.js';
import type { Root } from '@modelcontextprotocol/sdk/types.js';

/**
 * Converts a root URI to a normalized directory path.
 * @param uri - File URI (file://...) or plain directory path
 * @returns Normalized absolute directory path
 */
function parseRootUri(uri: string): string {
  const rawPath = uri.startsWith('file://') ? uri.slice(7) : uri;
  return normalizePath(path.resolve(rawPath));
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
 * Gets valid directory paths from MCP root specifications.
 * 
 * Converts root URI specifications (file:// URIs or plain paths) into normalized
 * directory paths, validating that each path exists and is a directory.
 * 
 * @param roots - Array of root specifications with URI and optional name
 * @returns Promise resolving to array of validated directory paths
 */
export async function getValidRootDirectories(
  roots: readonly Root[]
): Promise<string[]> {
  const validDirectories: string[] = [];
  
  for (const root of roots) {
    const dir = parseRootUri(root.uri);
    
    try {
      const stats: Stats = await fs.stat(dir);
      if (stats.isDirectory()) {
        validDirectories.push(dir);
      } else {
        console.error(formatDirectoryError(dir, undefined, 'non-directory root'));
      }
    } catch (error) {
      console.error(formatDirectoryError(dir, error));
    }
  }
  
  return validDirectories;
}