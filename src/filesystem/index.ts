#!/usr/bin/env node
// The stdio entry point of the filesystem server (the package's bin). It
// resolves the allowed directories named on the command line, builds the
// server with createServer() and connects it to stdio. Everything runs inside
// main(), and main() runs only when this file is the process entry point, so
// importing the module (as the tests do) starts nothing (#4854). main() takes
// the argv and the stdio streams as parameters so the tests can drive the real
// startup path in-process.

import type { Readable, Writable } from "node:stream";
import { realpathSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { normalizePath, expandHome } from "./path-utils.js";
import { createServer } from "./server.js";

/**
 * Resolve the allowed directories given on the command line, warning about and
 * dropping any that are missing or not directories. Exits the process when
 * directories were given and none of them is usable.
 */
export async function resolveAllowedDirectories(
  args: string[],
): Promise<string[]> {
  // Store allowed directories in normalized and resolved form
  // We store BOTH the original path AND the resolved path to handle symlinks correctly
  // This fixes the macOS /tmp -> /private/tmp symlink issue where users specify /tmp
  // but the resolved path is /private/tmp
  const allowedDirectories = (
    await Promise.all(
      args.map(async (dir) => {
        const expanded = expandHome(dir);
        const absolute = path.resolve(expanded);
        const normalizedOriginal = normalizePath(absolute);
        try {
          // Security: Resolve symlinks in allowed directories during startup
          // This ensures we know the real paths and can validate against them later
          const resolved = await fs.realpath(absolute);
          const normalizedResolved = normalizePath(resolved);
          // Return both original and resolved paths if they differ
          // This allows matching against either /tmp or /private/tmp on macOS
          if (normalizedOriginal !== normalizedResolved) {
            return [normalizedOriginal, normalizedResolved];
          }
          return [normalizedResolved];
        } catch {
          // If we can't resolve (doesn't exist), use the normalized absolute path
          // This allows configuring allowed dirs that will be created later
          return [normalizedOriginal];
        }
      }),
    )
  ).flat();

  // Filter to only accessible directories, warn about inaccessible ones
  const accessibleDirectories: string[] = [];
  for (const dir of allowedDirectories) {
    try {
      const stats = await fs.stat(dir);
      if (stats.isDirectory()) {
        accessibleDirectories.push(dir);
      } else {
        console.error(`Warning: ${dir} is not a directory, skipping`);
      }
    } catch {
      console.error(`Warning: Cannot access directory ${dir}, skipping`);
    }
  }

  // Exit only if ALL paths are inaccessible (and some were specified)
  if (accessibleDirectories.length === 0 && allowedDirectories.length > 0) {
    console.error("Error: None of the specified directories are accessible");
    process.exit(1);
  }

  return accessibleDirectories;
}

/**
 * Start the server over stdio with the allowed directories in `args`.
 * Resolves to the connected server once the transport is listening.
 */
export async function main(
  args: string[] = process.argv.slice(2),
  stdin: Readable = process.stdin,
  stdout: Writable = process.stdout,
): Promise<McpServer> {
  if (args.length === 0) {
    console.error(
      "Usage: mcp-server-filesystem [allowed-directory] [additional-directories...]",
    );
    console.error("Note: Allowed directories can be provided via:");
    console.error("  1. Command-line arguments (shown above)");
    console.error("  2. MCP roots protocol (if client supports it)");
    console.error(
      "At least one directory must be provided by EITHER method for the server to operate.",
    );
  }

  const allowedDirectories = await resolveAllowedDirectories(args);
  // With no directories and a client without Roots, the server closes the
  // connection after initialize (#4992); exit non-zero so the failure shows.
  const server = createServer(allowedDirectories, {
    onCannotOperate: () => process.exit(1),
  });

  const transport = new StdioServerTransport(stdin, stdout);
  await server.connect(transport);
  console.error("Secure MCP Filesystem Server running on stdio");
  if (allowedDirectories.length === 0) {
    console.error(
      "Started without allowed directories - waiting for client to provide roots via MCP protocol",
    );
  }
  return server;
}

/**
 * True when `entryPath` (process.argv[1]) is this module. Both sides are
 * realpath'd, because npm installs the bin as a symlink to dist/index.js.
 */
export function isEntryPoint(
  entryPath: string | undefined,
  moduleUrl: string,
): boolean {
  if (!entryPath) return false;
  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

/* v8 ignore start -- runs only when node executes this file as the bin, never under vitest; the spawn smoke in __tests__/bin-smoke.test.ts covers it */
if (isEntryPoint(process.argv[1], import.meta.url)) {
  main().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
  });
}
/* v8 ignore stop */
