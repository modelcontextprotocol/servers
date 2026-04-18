import { promises as fs, type Stats } from 'fs';
import path from 'path';
import { normalizePath, expandHome } from './path-utils.js';
import type { Root } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from "url";

/**
 * Safely converts a file:// URI to a filesystem path.
 * Handles edge cases where tilde (~) or other characters in the URI
 * are misinterpreted as the URI authority/host component.
 *
 * @param uri - The file:// URI to convert
 * @returns The filesystem path, or null if the URI is invalid
 */
function safeFileURLToPath(uri: string): string | null {
  try {
    return fileURLToPath(uri);
  } catch {
    // fileURLToPath can throw when the URI has an unexpected host component.
    // This happens when a path like "~/folder" is naively concatenated as
    // "file://~/folder" — the URL parser treats "~" as the hostname.
    // Try to recover by extracting the path after "file://" and normalizing it.
    try {
      const withoutScheme = uri.slice('file://'.length);
      // If the path starts with / it's absolute (file:///path or file:///~/path)
      if (withoutScheme.startsWith('/')) {
        return decodeURIComponent(withoutScheme);
      }
      // Otherwise treat the whole part after file:// as a path
      // (e.g., file://~/folder -> ~/folder)
      return decodeURIComponent(withoutScheme);
    } catch {
      return null;
    }
  }
}

/**
 * Converts a root URI to a normalized directory path with basic security validation.
 * Handles file:// URIs, plain paths, and paths containing tilde (~) characters
 * both as home directory shorthand and as literal characters in directory names.
 *
 * @param rootUri - File URI (file://...) or plain directory path
 * @returns Promise resolving to validated path or null if invalid
 */
async function parseRootUri(rootUri: string): Promise<string | null> {
  try {
    let rawPath: string;
    if (rootUri.startsWith('file://')) {
      const parsed = safeFileURLToPath(rootUri);
      if (parsed === null) {
        console.error(`Warning: Could not parse file URI: ${rootUri}`);
        return null;
      }
      rawPath = parsed;
    } else {
      rawPath = rootUri;
    }

    const expandedPath = expandHome(rawPath);
    const absolutePath = path.resolve(expandedPath);
    const resolvedPath = await fs.realpath(absolutePath);
    return normalizePath(resolvedPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Warning: Could not resolve root path "${rootUri}": ${message}`);
    return null;
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
  
  for (const requestedRoot of requestedRoots) {
    const resolvedPath = await parseRootUri(requestedRoot.uri);
    if (!resolvedPath) {
      console.error(formatDirectoryError(requestedRoot.uri, undefined, 'invalid path or inaccessible'));
      continue;
    }
    
    try {
      const stats: Stats = await fs.stat(resolvedPath);
      if (stats.isDirectory()) {
        validatedDirectories.push(resolvedPath);
      } else {
        console.error(formatDirectoryError(resolvedPath, undefined, 'non-directory root'));
      }
    } catch (error) {
      console.error(formatDirectoryError(resolvedPath, error));
    }
  }
  
  return validatedDirectories;
}