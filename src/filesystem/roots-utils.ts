import { promises as fs, type Stats } from "fs";
import path from "path";
import os from "os";
import {
  normalizePath,
  normalizePathFormat,
  realpathWithRetry,
} from "./path-utils.js";
import type { Root } from "@modelcontextprotocol/server";
import { fileURLToPath } from "url";

/** A root's two spellings: as the client advertised it, and its realpath. */
interface RootPaths {
  advertised: string;
  resolved: string;
}

/**
 * Converts a root URI to its normalized absolute path and its realpath.
 * Both are kept, as resolveAllowedDirectories in index.ts keeps both forms of
 * a command-line directory, so a request may use either spelling (#5183).
 * validatePath still realpaths every request, so access stays bounded by the
 * resolved directory.
 * @param rootUri - File URI (file://...) or plain directory path
 * @returns Promise resolving to both forms, or null if invalid
 */
async function parseRootUri(rootUri: string): Promise<RootPaths | null> {
  try {
    const rawPath = rootUri.startsWith("file://")
      ? fileURLToPath(rootUri)
      : rootUri;
    const expandedPath =
      rawPath.startsWith("~/") || rawPath === "~"
        ? path.join(os.homedir(), rawPath.slice(1))
        : rawPath;
    const absolutePath = path.resolve(expandedPath);
    const resolvedPath = await realpathWithRetry(absolutePath);
    return {
      // normalizePathFormat, not normalizePath: trimming whitespace or quotes
      // from the client's spelling would name a different directory.
      advertised: normalizePathFormat(absolutePath),
      resolved: normalizePath(resolvedPath),
    };
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
function formatDirectoryError(
  dir: string,
  error?: unknown,
  reason?: string,
): string {
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
 * Each root contributes its advertised form and, when it differs, its resolved
 * (realpath) form, deduplicated across roots.
 *
 * @param requestedRoots - Array of root specifications with URI and optional name
 * @returns Promise resolving to array of validated directory paths
 */
export async function getValidRootDirectories(
  requestedRoots: readonly Root[],
): Promise<string[]> {
  const validatedDirectories = new Set<string>();

  for (const requestedRoot of requestedRoots) {
    const rootPaths = await parseRootUri(requestedRoot.uri);
    if (!rootPaths) {
      console.error(
        formatDirectoryError(
          requestedRoot.uri,
          undefined,
          "invalid path or inaccessible",
        ),
      );
      continue;
    }

    const { advertised, resolved: resolvedPath } = rootPaths;
    try {
      const stats: Stats = await fs.stat(resolvedPath);
      if (stats.isDirectory()) {
        validatedDirectories.add(advertised);
        validatedDirectories.add(resolvedPath);
      } else {
        console.error(
          formatDirectoryError(resolvedPath, undefined, "non-directory root"),
        );
      }
    } catch (error) {
      console.error(formatDirectoryError(resolvedPath, error));
    }
  }

  return [...validatedDirectories];
}
