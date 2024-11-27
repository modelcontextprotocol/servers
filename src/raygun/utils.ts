import * as fs from "node:fs/promises";
import path from "node:path";

/**
 * Normalizes a file path for consistent comparison
 */
function normalizePath(p: string): string {
    return path.normalize(p).toLowerCase();
}

/**
 * Validates if a path is within allowed directories and resolves any symlinks
 */
async function validatePath(requestedPath: string, allowedDirectories: string[]): Promise<string> {
    const absolute = path.isAbsolute(requestedPath)
        ? path.resolve(requestedPath)
        : path.resolve(process.cwd(), requestedPath);

    const normalizedRequested = normalizePath(absolute);

    // Check if path is within allowed directories
    const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
    if (!isAllowed) {
        throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
    }

    // Handle symlinks by checking their real path
    try {
        const realPath = await fs.realpath(absolute);
        const normalizedReal = normalizePath(realPath);
        const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
        if (!isRealPathAllowed) {
            throw new Error("Access denied - symlink target outside allowed directories");
        }
        return realPath;
    } catch (error) {
        throw new Error(`Path does not exist or is not accessible: ${absolute}`);
    }
}

/**
 * Validates that a file has the correct extension for source maps
 */
async function validateSourceMap(filePath: string): Promise<void> {
    if (!filePath.toLowerCase().endsWith('.map') && !filePath.toLowerCase().endsWith('.js')) {
        throw new Error('File must have a .map or .js extension');
    }
}

/**
 * Validates a file for source map upload, checking both path and file type
 */
async function validateSourceMapFile(filePath: string, allowedDirectories: string[]): Promise<string> {
    const validatedPath = await validatePath(filePath, allowedDirectories);
    const stats = await fs.stat(validatedPath);

    if (!stats.isFile()) {
        throw new Error(`Source map path exists but is not a file: ${filePath}`);
    }

    await validateSourceMap(validatedPath);
    return validatedPath;
}

export const utils = {
    validatePath,
    validateSourceMap,
    validateSourceMapFile,
};