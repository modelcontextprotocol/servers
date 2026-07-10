import path from 'path';

/**
 * Checks if an absolute path is within any of the allowed directories.
 * 
 * @param absolutePath - The absolute path to check (will be normalized)
 * @param allowedDirectories - Array of absolute allowed directory paths (will be normalized)
 * @returns true if the path is within an allowed directory, false otherwise
 * @throws Error if given relative paths after normalization
 */
export function isPathWithinAllowedDirectories(absolutePath: string, allowedDirectories: string[]): boolean {
  // Type validation
  if (typeof absolutePath !== 'string' || !Array.isArray(allowedDirectories)) {
    return false;
  }

  // Reject empty inputs
  if (!absolutePath || allowedDirectories.length === 0) {
    return false;
  }

  // Reject null bytes (forbidden in paths)
  if (absolutePath.includes('\x00')) {
    return false;
  }

  // Normalize the input path
  let normalizedPath: string;
  try {
    normalizedPath = path.resolve(path.normalize(absolutePath));
  } catch {
    return false;
  }

  // Verify it's absolute after normalization
  if (!path.isAbsolute(normalizedPath)) {
    throw new Error('Path must be absolute after normalization');
  }

  // Check against each allowed directory
  return allowedDirectories.some(dir => {
    if (typeof dir !== 'string' || !dir) {
      return false;
    }

    // Reject null bytes in allowed dirs
    if (dir.includes('\x00')) {
      return false;
    }

    // Normalize the allowed directory
    let normalizedDir: string;
    try {
      normalizedDir = path.resolve(path.normalize(dir));
    } catch {
      return false;
    }

    // Verify allowed directory is absolute after normalization
    if (!path.isAbsolute(normalizedDir)) {
      throw new Error('Allowed directories must be absolute paths after normalization');
    }

    // Windows file systems are case-insensitive: compare drive letters and
    // UNC shares case-insensitively before the prefix containment check.
    const ci = path.sep === '\\' ? (s: string) => s.toLowerCase() : (s: string) => s;

    if (ci(normalizedPath) === ci(normalizedDir)) {
      return true;
    }

    if (normalizedDir === path.sep) {
      return normalizedPath.startsWith(path.sep);
    }

    if (path.sep === '\\' && normalizedDir.match(/^[A-Za-z]:\\?$/)) {
      return ci(normalizedDir.charAt(0)) === ci(normalizedPath.charAt(0))
        && ci(normalizedPath).startsWith(ci(normalizedDir.replace(/\\?$/, '\\')));
    }

    return ci(normalizedPath).startsWith(ci(normalizedDir) + path.sep);
  });
}