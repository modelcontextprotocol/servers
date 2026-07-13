import path from 'path';

/**
 * Normalizes a path without corrupting UNC paths.
 * On Windows, path.resolve() converts UNC paths like \\server\share to C:\server\share,
 * which breaks UNC path handling. This function preserves UNC paths.
 * 
 * @param p - The path to normalize
 * @returns Normalized path
 */
function normalizePathSafe(p: string): string {
  // Check if it's a UNC path (starts with \\ or //) BEFORE normalizing
  // We must check this first because path.normalize on macOS corrupts UNC paths
  if (p.startsWith('\\\\') || p.startsWith('//')) {
    // UNC paths: normalize slashes to backslashes and remove redundant slashes
    // but preserve the leading \\
    let normalized = p.replace(/\//g, '\\');
    // Ensure exactly two leading backslashes (not more, not less)
    normalized = normalized.replace(/^\\+/, '\\\\');
    // Normalize any double backslashes in the rest of the path to single
    // but be careful not to break the leading \\
    const rest = normalized.substring(2).replace(/\\+/g, '\\');
    return '\\\\' + rest;
  }
  
  // For non-UNC paths, use path.normalize then path.resolve
  const normalized = path.normalize(p);
  return path.resolve(normalized);
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
    normalizedPath = normalizePathSafe(absolutePath);
  } catch {
    return false;
  }

  // Verify it's absolute after normalization
  // UNC paths are always absolute, as are resolved paths
  const isUncPath = normalizedPath.startsWith('\\\\');
  if (!isUncPath && !path.isAbsolute(normalizedPath)) {
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
      normalizedDir = normalizePathSafe(dir);
    } catch {
      return false;
    }

    // Verify allowed directory is absolute after normalization
    const isUncDir = normalizedDir.startsWith('\\\\');
    if (!isUncDir && !path.isAbsolute(normalizedDir)) {
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
    
    // Special handling for UNC paths
    // Both paths must be UNC paths for a valid match
    if (isUncPath && isUncDir) {
      // For UNC paths, use backslash as separator
      return normalizedPath.startsWith(normalizedDir + '\\');
    }
    
    // If one is UNC and the other isn't, they can't match
    if (isUncPath !== isUncDir) {
      return false;
    }
    
    return normalizedPath.startsWith(normalizedDir + path.sep);
  });
}
