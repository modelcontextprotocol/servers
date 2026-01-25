#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RootsListChangedNotificationSchema, } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { z } from "zod";
import { minimatch } from "minimatch";
import { normalizePath, expandHome } from './path-utils.js';
import { getValidRootDirectories } from './roots-utils.js';
import { 
// Function imports
formatSize, validatePath, getFileStats, readFileContent, writeFileContent, searchFilesWithValidation, applyFileEdits, tailFile, headFile, setAllowedDirectories, } from './lib.js';
// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("Usage: mcp-server-filesystem [allowed-directory] [additional-directories...]");
    console.error("Note: Allowed directories can be provided via:");
    console.error("  1. Command-line arguments (shown above)");
    console.error("  2. MCP roots protocol (if client supports it)");
    console.error("At least one directory must be provided by EITHER method for the server to operate.");
}
// Store allowed directories in normalized and resolved form
let allowedDirectories = await Promise.all(args.map(async (dir) => {
    const expanded = expandHome(dir);
    const absolute = path.resolve(expanded);
    try {
        // Security: Resolve symlinks in allowed directories during startup
        // This ensures we know the real paths and can validate against them later
        const resolved = await fs.realpath(absolute);
        return normalizePath(resolved);
    }
    catch (error) {
        // If we can't resolve (doesn't exist), use the normalized absolute path
        // This allows configuring allowed dirs that will be created later
        return normalizePath(absolute);
    }
}));
// Validate that all directories exist and are accessible
await Promise.all(allowedDirectories.map(async (dir) => {
    try {
        const stats = await fs.stat(dir);
        if (!stats.isDirectory()) {
            console.error(`Error: ${dir} is not a directory`);
            process.exit(1);
        }
    }
    catch (error) {
        console.error(`Error accessing directory ${dir}:`, error);
        process.exit(1);
    }
}));
// Initialize the global allowedDirectories in lib.ts
setAllowedDirectories(allowedDirectories);
// Schema definitions
const ReadTextFileArgsSchema = z.object({
    path: z.string(),
    tail: z.number().optional().describe('If provided, returns only the last N lines of the file'),
    head: z.number().optional().describe('If provided, returns only the first N lines of the file')
});
const ReadMediaFileArgsSchema = z.object({
    path: z.string()
});
const ReadMultipleFilesArgsSchema = z.object({
    paths: z
        .array(z.string())
        .min(1, "At least one file path must be provided")
        .describe("Array of file paths to read. Each path must be a string pointing to a valid file within allowed directories."),
});
const WriteFileArgsSchema = z.object({
    path: z.string(),
    content: z.string(),
});
const EditOperation = z.object({
    oldText: z.string().describe('Text to search for - must match exactly'),
    newText: z.string().describe('Text to replace with')
});
const EditFileArgsSchema = z.object({
    path: z.string(),
    edits: z.array(EditOperation),
    dryRun: z.boolean().default(false).describe('Preview changes using git-style diff format')
});
const CreateDirectoryArgsSchema = z.object({
    path: z.string(),
});
const ListDirectoryArgsSchema = z.object({
    path: z.string(),
});
const ListDirectoryWithSizesArgsSchema = z.object({
    path: z.string(),
    sortBy: z.enum(['name', 'size']).optional().default('name').describe('Sort entries by name or size'),
});
const DirectoryTreeArgsSchema = z.object({
    path: z.string(),
    excludePatterns: z.array(z.string()).optional().default([])
});
const MoveFileArgsSchema = z.object({
    source: z.string(),
    destination: z.string(),
});
const SearchFilesArgsSchema = z.object({
    path: z.string(),
    pattern: z.string(),
    excludePatterns: z.array(z.string()).optional().default([])
});
const GetFileInfoArgsSchema = z.object({
    path: z.string(),
});
// Server setup
const server = new McpServer({
    name: "secure-filesystem-server",
    version: "0.2.0",
});
// Reads a file as a stream of buffers, concatenates them, and then encodes
// the result to a Base64 string. This is a memory-efficient way to handle
// binary data from a stream before the final encoding.
async function readFileAsBase64Stream(filePath) {
    return new Promise((resolve, reject) => {
        const stream = createReadStream(filePath);
        const chunks = [];
        stream.on('data', (chunk) => {
            chunks.push(chunk);
        });
        stream.on('end', () => {
            const finalBuffer = Buffer.concat(chunks);
            resolve(finalBuffer.toString('base64'));
        });
        stream.on('error', (err) => reject(err));
    });
}
// Tool registrations
// read_file (deprecated) and read_text_file
const readTextFileHandler = async (args) => {
    const validPath = await validatePath(args.path);
    if (args.head && args.tail) {
        throw new Error("Cannot specify both head and tail parameters simultaneously");
    }
    let content;
    if (args.tail) {
        content = await tailFile(validPath, args.tail);
    }
    else if (args.head) {
        content = await headFile(validPath, args.head);
    }
    else {
        content = await readFileContent(validPath);
    }
    return {
        content: [{ type: "text", text: content }],
        structuredContent: { content }
    };
};
server.registerTool("read_file", {
    title: "Read File (Deprecated)",
    description: "Read the complete contents of a file as text. DEPRECATED: Use read_text_file instead.",
    inputSchema: ReadTextFileArgsSchema.shape,
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, readTextFileHandler);
server.registerTool("read_text_file", {
    title: "Read Text File",
    description: "Read the complete contents of a file from the file system as text. " +
        "Handles various text encodings and provides detailed error messages " +
        "if the file cannot be read. Use this tool when you need to examine " +
        "the contents of a single file. Use the 'head' parameter to read only " +
        "the first N lines of a file, or the 'tail' parameter to read only " +
        "the last N lines of a file. Operates on the file as text regardless of extension. " +
        "Only works within allowed directories.",
    inputSchema: {
        path: z.string(),
        tail: z.number().optional().describe("If provided, returns only the last N lines of the file"),
        head: z.number().optional().describe("If provided, returns only the first N lines of the file")
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, readTextFileHandler);
server.registerTool("read_media_file", {
    title: "Read Media File",
    description: "Read an image or audio file. Returns the base64 encoded data and MIME type. " +
        "Only works within allowed directories.",
    inputSchema: {
        path: z.string()
    },
    outputSchema: {
        content: z.array(z.object({
            type: z.enum(["image", "audio", "blob"]),
            data: z.string(),
            mimeType: z.string()
        }))
    },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const validPath = await validatePath(args.path);
    const extension = path.extname(validPath).toLowerCase();
    const mimeTypes = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
        ".svg": "image/svg+xml",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
    };
    const mimeType = mimeTypes[extension] || "application/octet-stream";
    const data = await readFileAsBase64Stream(validPath);
    const type = mimeType.startsWith("image/")
        ? "image"
        : mimeType.startsWith("audio/")
            ? "audio"
            // Fallback for other binary types, not officially supported by the spec but has been used for some time
            : "blob";
    const contentItem = { type: type, data, mimeType };
    return {
        content: [contentItem],
        structuredContent: { content: [contentItem] }
    };
});
server.registerTool("read_multiple_files", {
    title: "Read Multiple Files",
    description: "Read the contents of multiple files simultaneously. This is more " +
        "efficient than reading files one by one when you need to analyze " +
        "or compare multiple files. Each file's content is returned with its " +
        "path as a reference. Failed reads for individual files won't stop " +
        "the entire operation. Only works within allowed directories.",
    inputSchema: {
        paths: z.array(z.string())
            .min(1)
            .describe("Array of file paths to read. Each path must be a string pointing to a valid file within allowed directories.")
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const results = await Promise.all(args.paths.map(async (filePath) => {
        try {
            const validPath = await validatePath(filePath);
            const content = await readFileContent(validPath);
            return `${filePath}:\n${content}\n`;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return `${filePath}: Error - ${errorMessage}`;
        }
    }));
    const text = results.join("\n---\n");
    return {
        content: [{ type: "text", text }],
        structuredContent: { content: text }
    };
});
server.registerTool("write_file", {
    title: "Write File",
    description: "Create a new file or completely overwrite an existing file with new content. " +
        "Use with caution as it will overwrite existing files without warning. " +
        "Handles text content with proper encoding. Only works within allowed directories.",
    inputSchema: {
        path: z.string(),
        content: z.string()
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: true }
}, async (args) => {
    const validPath = await validatePath(args.path);
    await writeFileContent(validPath, args.content);
    const text = `Successfully wrote to ${args.path}`;
    return {
        content: [{ type: "text", text }],
        structuredContent: { content: text }
    };
});
server.registerTool("edit_file", {
    title: "Edit File",
    description: "Make line-based edits to a text file. Each edit replaces exact line sequences " +
        "with new content. Returns a git-style diff showing the changes made. " +
        "Only works within allowed directories.",
    inputSchema: {
        path: z.string(),
        edits: z.array(z.object({
            oldText: z.string().describe("Text to search for - must match exactly"),
            newText: z.string().describe("Text to replace with")
        })),
        dryRun: z.boolean().default(false).describe("Preview changes using git-style diff format")
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: true }
}, async (args) => {
    const validPath = await validatePath(args.path);
    const result = await applyFileEdits(validPath, args.edits, args.dryRun);
    return {
        content: [{ type: "text", text: result }],
        structuredContent: { content: result }
    };
});
server.registerTool("create_directory", {
    title: "Create Directory",
    description: "Create a new directory or ensure a directory exists. Can create multiple " +
        "nested directories in one operation. If the directory already exists, " +
        "this operation will succeed silently. Perfect for setting up directory " +
        "structures for projects or ensuring required paths exist. Only works within allowed directories.",
    inputSchema: {
        path: z.string()
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false }
}, async (args) => {
    const validPath = await validatePath(args.path);
    await fs.mkdir(validPath, { recursive: true });
    const text = `Successfully created directory ${args.path}`;
    return {
        content: [{ type: "text", text }],
        structuredContent: { content: text }
    };
});
server.registerTool("list_directory", {
    title: "List Directory",
    description: "Get a detailed listing of all files and directories in a specified path. " +
        "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
        "prefixes. This tool is essential for understanding directory structure and " +
        "finding specific files within a directory. Only works within allowed directories.",
    inputSchema: {
        path: z.string()
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const validPath = await validatePath(args.path);
    const entries = await fs.readdir(validPath, { withFileTypes: true });
    const formatted = entries
        .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
        .join("\n");
    return {
        content: [{ type: "text", text: formatted }],
        structuredContent: { content: formatted }
    };
});
server.registerTool("list_directory_with_sizes", {
    title: "List Directory with Sizes",
    description: "Get a detailed listing of all files and directories in a specified path, including sizes. " +
        "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
        "prefixes. This tool is useful for understanding directory structure and " +
        "finding specific files within a directory. Only works within allowed directories.",
    inputSchema: {
        path: z.string(),
        sortBy: z.enum(["name", "size"]).optional().default("name").describe("Sort entries by name or size")
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const validPath = await validatePath(args.path);
    const entries = await fs.readdir(validPath, { withFileTypes: true });
    // Get detailed information for each entry
    const detailedEntries = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(validPath, entry.name);
        try {
            const stats = await fs.stat(entryPath);
            return {
                name: entry.name,
                isDirectory: entry.isDirectory(),
                size: stats.size,
                mtime: stats.mtime
            };
        }
        catch (error) {
            return {
                name: entry.name,
                isDirectory: entry.isDirectory(),
                size: 0,
                mtime: new Date(0)
            };
        }
    }));
    // Sort entries based on sortBy parameter
    const sortedEntries = [...detailedEntries].sort((a, b) => {
        if (args.sortBy === 'size') {
            return b.size - a.size; // Descending by size
        }
        // Default sort by name
        return a.name.localeCompare(b.name);
    });
    // Format the output
    const formattedEntries = sortedEntries.map(entry => `${entry.isDirectory ? "[DIR]" : "[FILE]"} ${entry.name.padEnd(30)} ${entry.isDirectory ? "" : formatSize(entry.size).padStart(10)}`);
    // Add summary
    const totalFiles = detailedEntries.filter(e => !e.isDirectory).length;
    const totalDirs = detailedEntries.filter(e => e.isDirectory).length;
    const totalSize = detailedEntries.reduce((sum, entry) => sum + (entry.isDirectory ? 0 : entry.size), 0);
    const summary = [
        "",
        `Total: ${totalFiles} files, ${totalDirs} directories`,
        `Combined size: ${formatSize(totalSize)}`
    ];
    const text = [...formattedEntries, ...summary].join("\n");
    const contentBlock = { type: "text", text };
    return {
        content: [contentBlock],
        structuredContent: { content: text }
    };
});
server.registerTool("directory_tree", {
    title: "Directory Tree",
    description: "Get a recursive tree view of files and directories as a JSON structure. " +
        "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
        "Files have no children array, while directories always have a children array (which may be empty). " +
        "The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
    inputSchema: {
        path: z.string(),
        excludePatterns: z.array(z.string()).optional().default([])
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const rootPath = args.path;
    async function buildTree(currentPath, excludePatterns = []) {
        const validPath = await validatePath(currentPath);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const result = [];
        for (const entry of entries) {
            const relativePath = path.relative(rootPath, path.join(currentPath, entry.name));
            const shouldExclude = excludePatterns.some(pattern => {
                if (pattern.includes('*')) {
                    return minimatch(relativePath, pattern, { dot: true });
                }
                // For files: match exact name or as part of path
                // For directories: match as directory path
                return minimatch(relativePath, pattern, { dot: true }) ||
                    minimatch(relativePath, `**/${pattern}`, { dot: true }) ||
                    minimatch(relativePath, `**/${pattern}/**`, { dot: true });
            });
            if (shouldExclude)
                continue;
            const entryData = {
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file'
            };
            if (entry.isDirectory()) {
                const subPath = path.join(currentPath, entry.name);
                entryData.children = await buildTree(subPath, excludePatterns);
            }
            result.push(entryData);
        }
        return result;
    }
    const treeData = await buildTree(rootPath, args.excludePatterns);
    const text = JSON.stringify(treeData, null, 2);
    const contentBlock = { type: "text", text };
    return {
        content: [contentBlock],
        structuredContent: { content: text }
    };
});
server.registerTool("move_file", {
    title: "Move File",
    description: "Move or rename files and directories. Can move files between directories " +
        "and rename them in a single operation. If the destination exists, the " +
        "operation will fail. Works across different directories and can be used " +
        "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
    inputSchema: {
        source: z.string(),
        destination: z.string()
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false }
}, async (args) => {
    const validSourcePath = await validatePath(args.source);
    const validDestPath = await validatePath(args.destination);
    await fs.rename(validSourcePath, validDestPath);
    const text = `Successfully moved ${args.source} to ${args.destination}`;
    const contentBlock = { type: "text", text };
    return {
        content: [contentBlock],
        structuredContent: { content: text }
    };
});
server.registerTool("search_files", {
    title: "Search Files",
    description: "Recursively search for files and directories matching a pattern. " +
        "The patterns should be glob-style patterns that match paths relative to the working directory. " +
        "Use pattern like '*.ext' to match files in current directory, and '**/*.ext' to match files in all subdirectories. " +
        "Returns full paths to all matching items. Great for finding files when you don't know their exact location. " +
        "Only searches within allowed directories.",
    inputSchema: {
        path: z.string(),
        pattern: z.string(),
        excludePatterns: z.array(z.string()).optional().default([])
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const validPath = await validatePath(args.path);
    const results = await searchFilesWithValidation(validPath, args.pattern, allowedDirectories, { excludePatterns: args.excludePatterns });
    const text = results.length > 0 ? results.join("\n") : "No matches found";
    return {
        content: [{ type: "text", text }],
        structuredContent: { content: text }
    };
});
server.registerTool("get_file_info", {
    title: "Get File Info",
    description: "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
        "information including size, creation time, last modified time, permissions, " +
        "and type. This tool is perfect for understanding file characteristics " +
        "without reading the actual content. Only works within allowed directories.",
    inputSchema: {
        path: z.string()
    },
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async (args) => {
    const validPath = await validatePath(args.path);
    const info = await getFileStats(validPath);
    const text = Object.entries(info)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
    return {
        content: [{ type: "text", text }],
        structuredContent: { content: text }
    };
});
server.registerTool("list_allowed_directories", {
    title: "List Allowed Directories",
    description: "Returns the list of directories that this server is allowed to access. " +
        "Subdirectories within these allowed directories are also accessible. " +
        "Use this to understand which directories and their nested paths are available " +
        "before trying to access files.",
    inputSchema: {},
    outputSchema: { content: z.string() },
    annotations: { readOnlyHint: true }
}, async () => {
    const text = `Allowed directories:\n${allowedDirectories.join('\n')}`;
    return {
        content: [{ type: "text", text }],
        structuredContent: { content: text }
    };
});
// Updates allowed directories based on MCP client roots
async function updateAllowedDirectoriesFromRoots(requestedRoots) {
    const validatedRootDirs = await getValidRootDirectories(requestedRoots);
    if (validatedRootDirs.length > 0) {
        allowedDirectories = [...validatedRootDirs];
        setAllowedDirectories(allowedDirectories); // Update the global state in lib.ts
        console.error(`Updated allowed directories from MCP roots: ${validatedRootDirs.length} valid directories`);
    }
    else {
        console.error("No valid root directories provided by client");
    }
}
// Handles dynamic roots updates during runtime, when client sends "roots/list_changed" notification, server fetches the updated roots and replaces all allowed directories with the new roots.
server.server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    try {
        // Request the updated roots list from the client
        const response = await server.server.listRoots();
        if (response && 'roots' in response) {
            await updateAllowedDirectoriesFromRoots(response.roots);
        }
    }
    catch (error) {
        console.error("Failed to request roots from client:", error instanceof Error ? error.message : String(error));
    }
});
// Handles post-initialization setup, specifically checking for and fetching MCP roots.
server.server.oninitialized = async () => {
    const clientCapabilities = server.server.getClientCapabilities();
    if (clientCapabilities?.roots) {
        try {
            const response = await server.server.listRoots();
            if (response && 'roots' in response) {
                await updateAllowedDirectoriesFromRoots(response.roots);
            }
            else {
                console.error("Client returned no roots set, keeping current settings");
            }
        }
        catch (error) {
            console.error("Failed to request initial roots from client:", error instanceof Error ? error.message : String(error));
        }
    }
    else {
        if (allowedDirectories.length > 0) {
            console.error("Client does not support MCP Roots, using allowed directories set from server args:", allowedDirectories);
        }
        else {
            throw new Error(`Server cannot operate: No allowed directories available. Server was started without command-line directories and client either does not support MCP roots protocol or provided empty roots. Please either: 1) Start server with directory arguments, or 2) Use a client that supports MCP roots protocol and provides valid root directories.`);
        }
    }
};
// Start server
async function runServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Secure MCP Filesystem Server running on stdio");
    if (allowedDirectories.length === 0) {
        console.error("Started without allowed directories - waiting for client to provide roots via MCP protocol");
    }
}
runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
