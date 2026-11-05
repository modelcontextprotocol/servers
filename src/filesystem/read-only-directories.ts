// Per-directory read-only access (#5348): `--read-only-dir <path>` marks one
// allowed directory read-only while the others stay writable, the per-directory
// counterpart of the whole-server `--read-only` (#632, #1160).
//
// The marking is enforced inside validatePath (lib.ts), which takes an access
// mode that every caller must state: a "write" validation must be handed the
// read-only directories, so a new write tool cannot reach the filesystem
// without the check. The check runs on the path validatePath resolved, its
// real location, so a symlink cannot route a write into a read-only directory,
// and a path is refused when it is inside ANY read-only directory: a writable
// directory nested inside a read-only one is read-only too. That keeps the rule
// fail-closed and needs no notion of which allowed directory is "closest".
//
// The read-only list is the operator's and is fixed at startup. A 2025-era
// client's Roots can replace the allowed directories, but Roots carry no
// access mode, so they never lift the marking: whatever directories are in
// force, a write into a read-only directory is refused. The directories here
// are resolved like the allowed ones (each spelling of a symlinked directory
// is kept) but are not filtered for existence: a marking that cannot be
// resolved today still protects the path if it appears later.

import path from "path";
import {
  expandHome,
  normalizePathFormat,
  realpathWithRetry,
} from "./path-utils.js";
import { isPathWithinAllowedDirectories } from "./path-validation.js";

/**
 * The read-only directories as given on the command line, in the forms they
 * are compared in: each one absolute and normalized, plus its resolved form
 * when it is a symlink (as macOS /tmp is for /private/tmp).
 */
export async function resolveReadOnlyDirectories(
  directories: readonly string[],
): Promise<string[]> {
  const resolved = await Promise.all(
    directories.map(async (dir) => {
      const absolute = path.resolve(expandHome(dir));
      const spellings = [normalizePathFormat(absolute)];
      try {
        spellings.push(normalizePathFormat(await realpathWithRetry(absolute)));
      } catch {
        // Missing for now: keep the configured spelling, so the marking
        // still applies if the directory is created later.
      }
      return spellings;
    }),
  );
  return [...new Set(resolved.flat())];
}

/**
 * The read-only directory that `resolvedPath` (a path validatePath resolved)
 * falls in, or undefined when it is in none.
 */
export function findReadOnlyDirectory(
  resolvedPath: string,
  readOnlyDirectories: readonly string[],
): string | undefined {
  const normalized = normalizePathFormat(resolvedPath);
  return readOnlyDirectories.find((dir) =>
    isPathWithinAllowedDirectories(normalized, [dir]),
  );
}

/**
 * Throw when `resolvedPath` is inside a read-only directory, so a write tool
 * refuses it before touching the filesystem.
 */
export function assertWritable(
  resolvedPath: string,
  readOnlyDirectories: readonly string[],
): void {
  const directory = findReadOnlyDirectory(resolvedPath, readOnlyDirectories);
  if (directory !== undefined) {
    throw new Error(
      `Access denied - read-only directory: ${resolvedPath} is in ${directory}, which the server was started with --read-only-dir`,
    );
  }
}

/** The stderr line listing the read-only directories, logged at startup. */
export function describeReadOnlyDirectories(
  readOnlyDirectories: readonly string[],
): string {
  return [
    "Read-only directories (writes refused, whatever the allowed directories in force):",
    ...readOnlyDirectories.map((dir) => `  ${dir}`),
  ].join("\n");
}
