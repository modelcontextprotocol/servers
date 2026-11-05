import path from "path";

// On Windows a colon may appear in a path only as a drive letter's
// (`C:\dir`), optionally behind the `\\?\` or `\\.\` namespace prefix
// (`\\?\C:\dir`). NTFS reads any other colon as an alternate data stream
// (`file.txt:stream`, `file.txt::$DATA`): data stored inside the file that no
// listing, diff or hash of the visible file shows, so the server refuses such
// paths outright rather than let the tools read or write hidden streams
// (#5375, prototyped in #4523). POSIX allows colons in
// names, so the check runs only where `path` is the Windows implementation.
const WINDOWS_DRIVE_PREFIX = /^(?:\\\\[?.]\\)?[A-Za-z]:/;

/**
 * True when `normalizedPath`, on Windows, holds a colon anywhere but the
 * drive-letter prefix, so NTFS would read it as naming an alternate data
 * stream. Always false on POSIX, where a colon is an ordinary name character.
 */
export function namesAlternateDataStream(normalizedPath: string): boolean {
  if (path.sep !== "\\") {
    return false;
  }
  const drive = WINDOWS_DRIVE_PREFIX.exec(normalizedPath);
  const rest = drive ? normalizedPath.slice(drive[0].length) : normalizedPath;
  return rest.includes(":");
}

/**
 * Checks if an absolute path is within any of the allowed directories.
 *
 * @param absolutePath - The absolute path to check (will be normalized)
 * @param allowedDirectories - Array of absolute allowed directory paths (will be normalized)
 * @returns true if the path is within an allowed directory, false otherwise
 * @throws Error if given relative paths after normalization
 * @throws Error, on Windows, if `absolutePath` names an NTFS alternate data
 *   stream (a colon anywhere but the drive prefix), so the caller reports
 *   why it was refused rather than "outside allowed directories" (#5375).
 */
export function isPathWithinAllowedDirectories(
  absolutePath: string,
  allowedDirectories: readonly string[],
): boolean {
  // Type validation
  if (typeof absolutePath !== "string" || !Array.isArray(allowedDirectories)) {
    return false;
  }

  // Reject empty inputs
  if (!absolutePath || allowedDirectories.length === 0) {
    return false;
  }

  // Reject null bytes (forbidden in paths)
  if (absolutePath.includes("\x00")) {
    return false;
  }

  // Normalize the input path
  let normalizedPath: string;
  try {
    normalizedPath = path.resolve(path.normalize(absolutePath));
  } catch {
    /* v8 ignore next -- path.normalize/resolve throw only on a non-string, and the typeof check above already returned for one */
    return false;
  }

  if (namesAlternateDataStream(normalizedPath)) {
    throw new Error(
      `Access denied - NTFS alternate data stream paths are not supported (a colon is allowed only after a drive letter): ${absolutePath}`,
    );
  }

  // Verify it's absolute after normalization
  /* v8 ignore next -- path.resolve always returns an absolute path, so this cannot fire */
  if (!path.isAbsolute(normalizedPath)) {
    throw new Error("Path must be absolute after normalization");
  }

  // Check against each allowed directory
  return allowedDirectories.some((dir) => {
    if (typeof dir !== "string" || !dir) {
      return false;
    }

    // Reject null bytes in allowed dirs
    if (dir.includes("\x00")) {
      return false;
    }

    // Normalize the allowed directory
    let normalizedDir: string;
    try {
      normalizedDir = path.resolve(path.normalize(dir));
    } catch {
      /* v8 ignore next -- path.normalize/resolve throw only on a non-string, and the typeof check above already returned false for one */
      return false;
    }

    // Verify allowed directory is absolute after normalization
    /* v8 ignore next -- path.resolve always returns an absolute path, so this cannot fire */
    if (!path.isAbsolute(normalizedDir)) {
      throw new Error(
        "Allowed directories must be absolute paths after normalization",
      );
    }

    // Check if normalizedPath is within normalizedDir
    // Path is inside if it's the same or a subdirectory
    if (normalizedPath === normalizedDir) {
      return true;
    }

    // Special case for root directory to avoid double slash
    // On Windows, we need to check if both paths are on the same drive
    if (normalizedDir === path.sep) {
      return normalizedPath.startsWith(path.sep);
    }

    // On Windows, also check for drive root (e.g., "C:\")
    if (path.sep === "\\" && normalizedDir.match(/^[A-Za-z]:\\?$/)) {
      // Ensure both paths are on the same drive
      const dirDrive = normalizedDir.charAt(0).toLowerCase();
      const pathDrive = normalizedPath.charAt(0).toLowerCase();
      return (
        pathDrive === dirDrive &&
        normalizedPath.startsWith(normalizedDir.replace(/\\?$/, "\\"))
      );
    }

    // path.resolve strips a trailing separator except from a root, and a UNC
    // share root (\\server\share\) keeps one, so appending another would give
    // \\server\share\\, a prefix nothing matches (#3527). Append one only when
    // it is missing; the boundary stays at a separator either way, so a
    // sibling such as \\server\share-evil still does not match.
    const dirWithSep = normalizedDir.endsWith(path.sep)
      ? normalizedDir
      : normalizedDir + path.sep;
    return normalizedPath.startsWith(dirWithSep);
  });
}
