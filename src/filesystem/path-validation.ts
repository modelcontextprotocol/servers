import path from 'path';

/**
 * Whether path containment should be compared case-insensitively.
 *
 * Windows file systems (NTFS/FAT) are case-insensitive but case-preserving,
 * so the same directory may legitimately be reached as `c:\source`,
 * `C:\source`, or `C:\Source` (GitHub issue #470). Only fold case when
 * running on win32; POSIX file systems are case-sensitive and must keep
 * byte-exact comparisons.
 */
const IS_WINDOWS = process.platform === 'win32';

/**
 * Folds a resolved absolute path into its comparable form.
 * On Windows both sides of the comparison are lowercased so drive-letter and
 * inner-component casing differences never cause false access denials.
 * On POSIX the path is returned untouched.
 */
function comparablePath(absolutePath: string): string {
  return IS_WINDOWS ? absolutePath.toLowerCase() : absolutePath;
}

/**
 * Pure containment check: is `targetPath` equal to, or nested under, any of
 * `allowedRoots`?
 *
 * Both sides are resolved with path.resolve() before comparing, so relative
 * input, redundant separators, and `.`/`..` segments cannot smuggle a path
 * across a boundary — a traversal escape is judged by its final resolved
 * location. The root prefix must match up to a segment boundary, so
 * `/allowed` never matches `/allowed2`.
 *
 * The comparison is case-insensitive when `process.platform === 'win32'`
 * and byte-exact on every other platform.
 *
 * @param allowedRoots - Allowed directory roots (absolute recommended; resolved internally)
 * @param targetPath - Path to test against the allowed roots
 * @returns true if targetPath is within an allowed root, false otherwise
 */
export function isPathWithin(allowedRoots: unknown[], targetPath: unknown): boolean {
  // Type validation
  if (!Array.isArray(allowedRoots) || typeof targetPath !== 'string' || !targetPath) {
    return false;
  }

  // Reject null bytes (forbidden in paths)
  if (targetPath.includes('\x00')) {
    return false;
  }

  // Normalize the target once; resolve() also collapses `.`/`..` segments so
  // traversal attempts are judged on where they actually land.
  let resolvedTarget: string;
  try {
    resolvedTarget = path.resolve(path.normalize(targetPath));
  } catch {
    return false;
  }
  const foldedTarget = comparablePath(resolvedTarget);

  return allowedRoots.some(root => {
    if (typeof root !== 'string' || !root || root.includes('\x00')) {
      return false;
    }

    let resolvedRoot: string;
    try {
      resolvedRoot = path.resolve(path.normalize(root));
    } catch {
      return false;
    }
    const foldedRoot = comparablePath(resolvedRoot);

    // The target may be the allowed root itself
    if (foldedTarget === foldedRoot) {
      return true;
    }

    // Require a segment-boundary prefix. Resolved roots only keep their
    // trailing separator at a file-system root (`/` or `C:\`), so this one
    // rule covers plain directories, POSIX root, and drive roots alike —
    // including the different-drive rejection on Windows.
    const rootPrefix = foldedRoot.endsWith(path.sep) ? foldedRoot : foldedRoot + path.sep;
    return foldedTarget.startsWith(rootPrefix);
  });
}

/**
 * Checks if an absolute path is within any of the allowed directories.
 *
 * Backward-compatible wrapper around {@link isPathWithin} that preserves the
 * historic argument order (target path first). All containment decisions —
 * including the Windows case-insensitive behavior for issue #470 — live in
 * {@link isPathWithin}.
 *
 * @param absolutePath - The absolute path to check (will be normalized)
 * @param allowedDirectories - Array of absolute allowed directory paths (will be normalized)
 * @returns true if the path is within an allowed directory, false otherwise
 */
export function isPathWithinAllowedDirectories(absolutePath: string, allowedDirectories: string[]): boolean {
  // Type validation
  if (typeof absolutePath !== 'string' || !Array.isArray(allowedDirectories)) {
    return false;
  }

  return isPathWithin(allowedDirectories, absolutePath);
}
