import path from 'path';

/**
 * Checks if a path is a Windows UNC path (e.g. \\server\share).
 */
function isUNCPath(p: string): boolean {
  return p.startsWith('\\\\') && !p.startsWith('\\\\?\\');
}

/**
 * Normalizes a path, preserving UNC path prefixes on Windows.
 *
 * On Windows, path.resolve(path.normalize(uncPath)) can corrupt UNC paths
 * by stripping a leading backslash, turning \\server\share into \server\share
 * which path.resolve then interprets as drive-relative (e.g. C:\server\share).
 * UNC paths are always absolute, so we normalize without path.resolve.
 */
function normalizePath(p: string): string {
  if (isUNCPath(p)) {
    // UNC paths are always absolute — normalize without resolve to avoid
    // stripping the leading \\ prefix.
    const normalized = path.normalize(p);
    // Ensure the UNC prefix is preserved after normalization
    if (!normalized.startsWith('\\\\')) {
      return '\\' + normalized;
    }
    return normalized;
  }
  return path.resolve(path.normalize(p));
}

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
    normalizedPath = normalizePath(absolutePath);
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
      normalizedDir = normalizePath(dir);
    } catch {
      return false;
    }

    // Verify allowed directory is absolute after normalization
    if (!path.isAbsolute(normalizedDir)) {
      throw new Error('Allowed directories must be absolute paths after normalization');
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
    if (path.sep === '\\' && normalizedDir.match(/^[A-Za-z]:\\?$/)) {
      // Ensure both paths are on the same drive
      const dirDrive = normalizedDir.charAt(0).toLowerCase();
      const pathDrive = normalizedPath.charAt(0).toLowerCase();
      return pathDrive === dirDrive && normalizedPath.startsWith(normalizedDir.replace(/\\?$/, '\\'));
    }
    
    return normalizedPath.startsWith(normalizedDir + path.sep);
  });
}
