import path from "path";
import os from 'os';
/**
 * Converts WSL or Unix-style Windows paths to Windows format
 * @param p The path to convert
 * @returns Converted Windows path
 */
export function convertToWindowsPath(p) {
    // Handle WSL paths (/mnt/c/...)
    // NEVER convert WSL paths - they are valid Linux paths that work with Node.js fs operations in WSL
    // Converting them to Windows format (C:\...) breaks fs operations inside WSL
    if (p.startsWith('/mnt/')) {
        return p; // Leave WSL paths unchanged
    }
    // Handle Unix-style Windows paths (/c/...)
    // Only convert when running on Windows
    if (p.match(/^\/[a-zA-Z]\//) && process.platform === 'win32') {
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
export function normalizePath(p) {
    // Remove any surrounding quotes and whitespace
    p = p.trim().replace(/^["']|["']$/g, '');
    // Check if this is a Unix path that should not be converted
    // WSL paths (/mnt/) should ALWAYS be preserved as they work correctly in WSL with Node.js fs
    // Regular Unix paths should also be preserved
    const isUnixPath = p.startsWith('/') && (
    // Always preserve WSL paths (/mnt/c/, /mnt/d/, etc.)
    p.match(/^\/mnt\/[a-z]\//i) ||
        // On non-Windows platforms, treat all absolute paths as Unix paths
        (process.platform !== 'win32') ||
        // On Windows, preserve Unix paths that aren't Unix-style Windows paths (/c/, /d/, etc.)
        (process.platform === 'win32' && !p.match(/^\/[a-zA-Z]\//)));
    if (isUnixPath) {
        // For Unix paths, just normalize without converting to Windows format
        // Replace double slashes with single slashes and remove trailing slashes
        return p.replace(/\/+/g, '/').replace(/(?<!^)\/$/, '');
    }
    // Convert Unix-style Windows paths (/c/, /d/) to Windows format if on Windows
    // This function will now leave /mnt/ paths unchanged
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
    }
    else {
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
    // On Windows, convert forward slashes to backslashes for relative paths
    // On Linux/Unix, preserve forward slashes
    if (process.platform === 'win32') {
        return normalized.replace(/\//g, '\\');
    }
    // On non-Windows platforms, keep the normalized path as-is
    return normalized;
}
/**
 * Expands home directory tildes in paths
 * @param filepath The path to expand
 * @returns Expanded path
 */
export function expandHome(filepath) {
    if (filepath.startsWith('~/') || filepath === '~') {
        return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
}
