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
// force, a write into a read-only directory is refused. Each directory must
// exist when the server starts, and is resolved with the same realpath that
// write validation uses (each spelling of a symlinked directory is kept). A
// marking that cannot be resolved (missing, a dangling symlink, a name the
// disk spells differently) refuses startup rather than guessing where it
// will be, since a guess that differs from what write validation resolves
// would leave the directory writable.
//
// move_file validates both ends in "move" mode, which also refuses a path that
// contains a read-only directory: moving an ancestor would carry the protected
// subtree to a path the marking no longer names.

import fs from "fs/promises";
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
 * when it is a symlink (as macOS /tmp is for /private/tmp). Rejects when one
 * of them is not an existing directory.
 */
export async function resolveReadOnlyDirectories(
  directories: readonly string[],
): Promise<string[]> {
  const resolved = await Promise.all(
    directories.map(async (dir) => {
      const absolute = path.resolve(expandHome(dir));
      let resolved: string;
      try {
        resolved = await realpathWithRetry(absolute);
        if (!(await fs.stat(resolved)).isDirectory()) {
          throw new Error("not a directory");
        }
      } catch (error) {
        throw new Error(
          `--read-only-dir ${dir} is not an existing directory (${error instanceof Error ? error.message : String(error)}); a read-only directory must exist when the server starts`,
          { cause: error },
        );
      }
      return [normalizePathFormat(absolute), normalizePathFormat(resolved)];
    }),
  );
  return [...new Set(resolved.flat())];
}

// The macOS Data volume firmlinks /Users, /private and the rest into the
// root, and realpath keeps a /System/Volumes/Data/... spelling it is given, so
// one directory has two resolved spellings there. Both sides of every
// containment check below drop that prefix on darwin, so neither spelling
// reaches a read-only directory the other one names. pinned-directory.ts
// folds the same prefix for the same reason.
const DATA_VOLUME = "/System/Volumes/Data";

/** `p` normalized, without the macOS Data-volume prefix on darwin. */
function comparable(p: string, platform: string): string {
  const normalized = normalizePathFormat(p);
  return platform === "darwin" && normalized.startsWith(`${DATA_VOLUME}/`)
    ? normalized.slice(DATA_VOLUME.length)
    : normalized;
}

/**
 * The read-only directory that `resolvedPath` (a path validatePath resolved)
 * falls in, or undefined when it is in none.
 */
export function findReadOnlyDirectory(
  resolvedPath: string,
  readOnlyDirectories: readonly string[],
  platform: string = process.platform,
): string | undefined {
  const target = comparable(resolvedPath, platform);
  return readOnlyDirectories.find((dir) =>
    isPathWithinAllowedDirectories(target, [comparable(dir, platform)]),
  );
}

/**
 * Throw when `resolvedPath` is inside a read-only directory, so a write tool
 * refuses it before touching the filesystem. For a `move`, also throw when a
 * read-only directory is inside `resolvedPath`, since moving it would carry
 * the protected subtree out from under its marking.
 */
export function assertWritable(
  resolvedPath: string,
  readOnlyDirectories: readonly string[],
  access: "write" | "move" = "write",
  platform: string = process.platform,
): void {
  const directory = findReadOnlyDirectory(
    resolvedPath,
    readOnlyDirectories,
    platform,
  );
  if (directory !== undefined) {
    throw new Error(
      `Access denied - read-only directory: ${resolvedPath} is in ${directory}, which the server was started with --read-only-dir`,
    );
  }
  if (access === "move") {
    const target = comparable(resolvedPath, platform);
    const contained = readOnlyDirectories.find((dir) =>
      isPathWithinAllowedDirectories(comparable(dir, platform), [target]),
    );
    if (contained !== undefined) {
      throw new Error(
        `Access denied - read-only directory: ${resolvedPath} contains ${contained}, which the server was started with --read-only-dir`,
      );
    }
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
