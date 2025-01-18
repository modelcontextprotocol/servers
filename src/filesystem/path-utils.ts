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

  return p;
}

/**
 * Normalizes path by standardizing format for Windows
 * @param p The path to normalize
 * @returns Normalized path
 */
export function normalizePath(p: string): string {
  // Remove any surrounding quotes and whitespace
  p = p.trim().replace(/^["']|["']$/g, '');
  
  // Convert WSL or Unix-style paths to Windows format
  p = convertToWindowsPath(p);
  
  // Handle double backslashes and ensure proper escaping
  p = p.replace(/\\\\/g, '\\');
  
  // Use Node's path normalization, which handles . and .. segments
  const normalized = path.normalize(p);
  
  // Ensure Windows paths use backslashes consistently
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
