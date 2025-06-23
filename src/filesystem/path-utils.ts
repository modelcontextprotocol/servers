import path from "path";
import os from 'os';

/**
 * Converts WSL or Unix-style Windows paths to Windows format
 * @param p The path to convert
 * @returns Converted Windows path
 */
export function convertToWindowsPath(p: string): string {
  // Handle WSL paths (/mnt/c/...)
  if (p.startsWith('/mnt/')) {
    const driveLetter = p.charAt(5).toUpperCase();
    const pathPart = p.slice(6).replace(/\//g, '\\');
    return `${driveLetter}:${pathPart}`;
  }
  
  // Handle Unix-style Windows paths (/c/...)
  if (p.match(/^\/[a-zA-Z]\//)) {
    const driveLetter = p.charAt(1).toUpperCase();
    const pathPart = p.slice(2).replace(/\//g, '\\');
    return `${driveLetter}:${pathPart}`;
  }

  // Handle standard Windows paths, ensuring backslashes
  if (p.match(/^[a-zA-Z]:/)) {
    return p.replace(/\//g, '\\');
  }

  // Leave non-Windows paths unchanged
  return p;
}

/**
 * Normalizes path by standardizing format while preserving OS-specific behavior
 * @param p The path to normalize
 * @returns Normalized path
 */
export function normalizePath(p: string): string {
  // Remove any surrounding quotes and whitespace
  p = p.trim().replace(/^["']|["']$/g, '');
  
  // Check if this is a Unix path (starts with / but not a Windows or WSL path)
  const isUnixPath = p.startsWith('/') && 
                    !p.match(/^\/mnt\/[a-z]\//i) && 
                    !p.match(/^\/[a-zA-Z]\//);
  
  if (isUnixPath) {
    // For Unix paths, just normalize without converting to Windows format
    // Replace double slashes with single slashes and remove trailing slashes
    return p.replace(/\/+/g, '/').replace(/\/+$/, '');
  }
  
  // Convert WSL or Unix-style Windows paths to Windows format
  p = convertToWindowsPath(p);
  
  // Handle double backslashes, preserving leading UNC \\
  if (p.startsWith('\\\\')) {
    // For UNC paths, first normalize any excessive leading backslashes to exactly \\
    // Then normalize double backslashes in the rest of the path
    let uncPath = p;
    // Replace multiple leading backslashes with exactly two
    uncPath = uncPath.replace(/^\\{2,}/, '\\\\');
    // Now normalize any remaining double backslashes in the rest of the path
    const restOfPath = uncPath.substring(2).replace(/\\\\/g, '\\');
    p = '\\\\' + restOfPath;
  } else {
    // For non-UNC paths, normalize all double backslashes
    p = p.replace(/\\\\/g, '\\');
  }
  
  // Use Node's path normalization, which handles . and .. segments
  let normalized = path.normalize(p);
  
  // Fix UNC paths after normalization (path.normalize can remove a leading backslash)
  if (p.startsWith('\\\\') && !normalized.startsWith('\\\\')) {
    normalized = '\\' + normalized;
  }
  
  // Handle Windows paths: convert slashes and ensure drive letter is capitalized
  if (normalized.match(/^[a-zA-Z]:/)) {
    let result = normalized.replace(/\//g, '\\');
    // Capitalize drive letter if present
    if (/^[a-z]:/.test(result)) {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }
    return result;
  }
  
  // For all other paths (including relative paths), convert forward slashes to backslashes
  // This ensures relative paths like "some/relative/path" become "some\\relative\\path"
  return normalized.replace(/\//g, '\\');
}

/**
 * Expands home directory tildes in paths
 * @param filepath The path to expand
 * @returns Expanded path
 */
export function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}
