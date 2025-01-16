import path from "path";
import os from 'os';

/**
 * Handles path quoting for Windows paths with spaces
 * @param p The path to quote
 * @returns Quoted path if it contains spaces, original path otherwise
 */
export function quotePath(p: string): string {
  return /\s/.test(p) ? `"${p}"` : p;
}

/**
 * Converts WSL or Unix-style Windows paths to Windows format
 * @param p The path to convert
 * @returns Converted Windows path
 */
export function convertToWindowsPath(p: string): string {
  // Handle WSL paths (/mnt/c/...)
  if (p.startsWith('/mnt/')) {
    const driveLetter = p.charAt(5).toUpperCase();
    return `${driveLetter}:${p.slice(6).replace(/\//g, '\\')}`;
  }
  
  // Handle Unix-style Windows paths (/c/...)
  if (p.match(/^\/[a-zA-Z]\//)) {
    const driveLetter = p.charAt(1).toUpperCase();
    return `${driveLetter}:${p.slice(2).replace(/\//g, '\\')}`;
  }

  return p;
}

/**
 * Normalizes path by removing quotes and standardizing separators
 * @param p The path to normalize
 * @returns Normalized path
 */
export function normalizePath(p: string): string {
  // Remove any surrounding quotes
  p = p.replace(/^["']|["']$/g, '');
  
  // Convert WSL or Unix-style paths to Windows format
  p = convertToWindowsPath(p);
  
  // Handle double backslashes
  p = p.replace(/\\\\/g, '\\');
  
  // Use OS-specific path normalization
  return path.normalize(p);
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
