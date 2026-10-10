// The filesystem server, built per call by createServer(). index.ts is the
// stdio entry point that resolves the allowed directories from argv and hands
// them here. Building the server in a factory, rather than at module load,
// lets the tests drive a real Client against it in-process over an in-memory
// transport (#4854), and holding the allow-list in this closure rather than in
// a module global lets two instances coexist in one process.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  RootsListChangedNotificationSchema,
  type Root,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { z } from "zod";
import { minimatch } from "minimatch";
import { getValidRootDirectories } from "./roots-utils.js";
import {
  formatSize,
  validatePath,
  getFileStats,
  readFileContent,
  writeFileContent,
  moveFile,
  searchFilesWithValidation,
  applyFileEdits,
  tailFile,
  headFile,
} from "./lib.js";
import { SERVER_VERSION } from "./version.js";

// The JSON Schema dialect every advertised tool schema declares (#4841). The
// SDK 1.x tools/list handler renders zod schemas with zod's draft-07 target and
// stamps "$schema": draft-07 on each one, which validators that accept only
// 2020-12 (the dialect MCP assumes for tool schemas) reject outright. Setting
// $schema in the root object's zod metadata overrides that stamp. The schemas
// below use nothing whose draft-07 and 2020-12 renderings differ (no tuples),
// so the label is the only change; server-tools.test.ts fails if a draft-07-only
// keyword ever appears under it.
const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

/** A tool's input or output shape as an object schema declaring 2020-12. */
function jsonSchema2020<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object(shape).meta({ $schema: JSON_SCHEMA_DIALECT });
}

// Schema definitions
const ReadTextFileArgsSchema = z.object({
  path: z.string(),
  tail: z
    .number()
    .optional()
    .describe("If provided, returns only the last N lines of the file"),
  head: z
    .number()
    .optional()
    .describe("If provided, returns only the first N lines of the file"),
});

const ReadMediaFileArgsSchema = z.object({
  path: z.string(),
});

const ReadMultipleFilesArgsSchema = z.object({
  paths: z
    .array(z.string())
    .min(1)
    .describe(
      "Array of file paths to read. Each path must be a string pointing to a valid file within allowed directories.",
    ),
});

const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const EditOperation = z.object({
  oldText: z.string().describe("Text to search for - must match exactly"),
  newText: z.string().describe("Text to replace with"),
});

const EditFileArgsSchema = z.object({
  path: z.string(),
  edits: z.array(EditOperation),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Preview changes using git-style diff format"),
});

const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryWithSizesArgsSchema = z.object({
  path: z.string(),
  sortBy: z
    .enum(["name", "size"])
    .optional()
    .default("name")
    .describe("Sort entries by name or size"),
});

const DirectoryTreeArgsSchema = z.object({
  path: z.string(),
  excludePatterns: z.array(z.string()).optional().default([]),
});

const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  excludePatterns: z.array(z.string()).optional().default([]),
});

const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

// Reads a file as a stream of buffers, concatenates them, and then encodes
// the result to a Base64 string. This is a memory-efficient way to handle
// binary data from a stream before the final encoding.
async function readFileAsBase64Stream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => {
      chunks.push(chunk as Buffer);
    });
    stream.on("end", () => {
      const finalBuffer = Buffer.concat(chunks);
      resolve(finalBuffer.toString("base64"));
    });
    stream.on("error", (err) => reject(err));
  });
}

/**
 * Why the server cannot operate when it has no allowed directories from either
 * the command line or the client's Roots (#4992).
 */
export const NO_ALLOWED_DIRECTORIES_ERROR =
  "Server cannot operate: No allowed directories available. Server was started without command-line directories and client does not support MCP roots protocol. Please either: 1) Start server with directory arguments, or 2) Use a client that supports MCP roots protocol and provides valid root directories.";

export interface ServerOptions {
  /**
   * Called after the server has closed the connection because it cannot
   * operate: no directories were given and the client does not support
   * Roots (#4992). The stdio entry point exits the process from here.
   */
  onCannotOperate?: (error: Error) => void;
}

/**
 * Build a filesystem server that may touch only `initialAllowedDirectories`
 * (already resolved and normalized by the caller) until the client's Roots
 * replace them.
 */
export function createServer(
  initialAllowedDirectories: string[],
  options: ServerOptions = {},
): McpServer {
  let allowedDirectories = [...initialAllowedDirectories];
  // True once the client's roots have replaced the command-line directories.
  // From then on a roots update replaces them even with none, so a client that
  // withdraws its roots withdraws the server's access too (#5094). Until then an
  // update with no valid roots keeps the command-line directories.
  let rootsInForce = false;
  // Each roots refresh (the initial load and every roots/list_changed) takes
  // the next generation before it asks for roots. The SDK runs notification
  // handlers without waiting for earlier ones, so answers can come back out of
  // order; one is applied only if no newer refresh has started since, so a
  // stale answer cannot undo a newer update, such as a revocation (#5097).
  let rootsGeneration = 0;

  const server = new McpServer({
    name: "secure-filesystem-server",
    version: SERVER_VERSION,
  });

  // Settles once the post-initialize setup (fetching the client's initial
  // roots) has finished, successfully or not; it never rejects. Every tool call
  // waits for it, so a call that arrives while the initial roots/list is still
  // outstanding is checked against the client's roots rather than against the
  // command-line directories (#3204). It is replaced in oninitialized, which
  // the SDK runs before any request sent after notifications/initialized.
  let initialization: Promise<void> = Promise.resolve();
  // True from the initial roots/list until a refresh's answer has been
  // applied or the newest refresh has failed. A roots/list_changed that
  // overtakes the initial load while this holds replaces `initialization`, so
  // waiting tool calls keep waiting for the refresh that will actually apply
  // rather than running against the command-line directories (#5097).
  let initialRootsPending = false;
  const registerTool = server.registerTool.bind(server);
  server.registerTool = ((
    name: string,
    config: Parameters<typeof registerTool>[1],
    handler: (...args: unknown[]) => unknown,
  ) =>
    registerTool(name, config, (async (...args: unknown[]) => {
      let awaited: Promise<void>;
      do {
        awaited = initialization;
        await awaited;
      } while (awaited !== initialization);
      return handler(...args);
    }) as never)) as typeof server.registerTool;

  // Tool registrations

  // read_file (deprecated) and read_text_file
  const readTextFileHandler = async (
    args: z.infer<typeof ReadTextFileArgsSchema>,
  ) => {
    const validPath = await validatePath(args.path, allowedDirectories);

    if (args.head && args.tail) {
      throw new Error(
        "Cannot specify both head and tail parameters simultaneously",
      );
    }

    let content: string;
    if (args.tail) {
      content = await tailFile(validPath, args.tail);
    } else if (args.head) {
      content = await headFile(validPath, args.head);
    } else {
      content = await readFileContent(validPath);
    }

    return {
      content: [{ type: "text" as const, text: content }],
      structuredContent: { content },
    };
  };

  server.registerTool(
    "read_file",
    {
      title: "Read File (Deprecated)",
      description:
        "Read the complete contents of a file as text. DEPRECATED: Use read_text_file instead.",
      inputSchema: jsonSchema2020(ReadTextFileArgsSchema.shape),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    readTextFileHandler,
  );

  server.registerTool(
    "read_text_file",
    {
      title: "Read Text File",
      description:
        "Read the complete contents of a file from the file system as text. " +
        "Handles various text encodings and provides detailed error messages " +
        "if the file cannot be read. Use this tool when you need to examine " +
        "the contents of a single file. Use the 'head' parameter to read only " +
        "the first N lines of a file, or the 'tail' parameter to read only " +
        "the last N lines of a file. Operates on the file as text regardless of extension. " +
        "Only works within allowed directories.",
      inputSchema: jsonSchema2020({
        path: z.string(),
        tail: z
          .number()
          .optional()
          .describe("If provided, returns only the last N lines of the file"),
        head: z
          .number()
          .optional()
          .describe("If provided, returns only the first N lines of the file"),
      }),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    readTextFileHandler,
  );

  server.registerTool(
    "read_media_file",
    {
      title: "Read Media File",
      description:
        "Read a file and return it as a base64-encoded content block with its MIME type. " +
        "Image and audio files are returned as image/audio content; any other file type is " +
        "returned as an embedded resource. Only works within allowed directories.",
      inputSchema: jsonSchema2020(ReadMediaFileArgsSchema.shape),
      outputSchema: jsonSchema2020({
        content: z.array(
          z.union([
            z.object({
              type: z.enum(["image", "audio"]),
              data: z.string(),
              mimeType: z.string(),
            }),
            z.object({
              type: z.literal("resource"),
              resource: z.object({
                uri: z.string(),
                // Optional, matching the SDK's BlobResourceContents shape (the handler always sets it).
                mimeType: z.string().optional(),
                blob: z.string(),
              }),
            }),
          ]),
        ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args: z.infer<typeof ReadMediaFileArgsSchema>) => {
      const validPath = await validatePath(args.path, allowedDirectories);
      const extension = path.extname(validPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
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

      // Map the MIME type to a valid MCP content block. The spec only allows
      // text, image, audio, resource_link, and resource — so non-image/audio
      // binaries are returned as an embedded resource (NOT type:"blob", which the
      // SDK content-block union rejects on schema validation).
      const contentItem = mimeType.startsWith("image/")
        ? { type: "image" as const, data, mimeType }
        : mimeType.startsWith("audio/")
          ? { type: "audio" as const, data, mimeType }
          : {
              type: "resource" as const,
              resource: {
                uri: pathToFileURL(validPath).href,
                mimeType,
                blob: data,
              },
            };
      return {
        content: [contentItem],
        structuredContent: { content: [contentItem] },
      };
    },
  );

  server.registerTool(
    "read_multiple_files",
    {
      title: "Read Multiple Files",
      description:
        "Read the contents of multiple files simultaneously. This is more " +
        "efficient than reading files one by one when you need to analyze " +
        "or compare multiple files. Each file's content is returned with its " +
        "path as a reference. Failed reads for individual files won't stop " +
        "the entire operation. Only works within allowed directories.",
      inputSchema: jsonSchema2020(ReadMultipleFilesArgsSchema.shape),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args: z.infer<typeof ReadMultipleFilesArgsSchema>) => {
      const results = await Promise.all(
        args.paths.map(async (filePath: string) => {
          try {
            const validPath = await validatePath(filePath, allowedDirectories);
            const content = await readFileContent(validPath);
            return `${filePath}:\n${content}\n`;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            return `${filePath}: Error - ${errorMessage}`;
          }
        }),
      );
      const text = results.join("\n---\n");
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { content: text },
      };
    },
  );

  server.registerTool(
    "write_file",
    {
      title: "Write File",
      description:
        "Create a new file or completely overwrite an existing file with new content. " +
        "Use with caution as it will overwrite existing files without warning. " +
        "Handles text content with proper encoding. Only works within allowed directories.",
      inputSchema: jsonSchema2020(WriteFileArgsSchema.shape),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: true,
        openWorldHint: false,
      },
    },
    async (args: z.infer<typeof WriteFileArgsSchema>) => {
      const validPath = await validatePath(args.path, allowedDirectories);
      await writeFileContent(validPath, args.content);
      const text = `Successfully wrote to ${args.path}`;
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { content: text },
      };
    },
  );

  server.registerTool(
    "edit_file",
    {
      title: "Edit File",
      description:
        "Make line-based edits to a text file. Each edit replaces exact line sequences " +
        "with new content. Returns a git-style diff showing the changes made. " +
        "Only works within allowed directories.",
      inputSchema: jsonSchema2020(EditFileArgsSchema.shape),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
    },
    async (args: z.infer<typeof EditFileArgsSchema>) => {
      const validPath = await validatePath(args.path, allowedDirectories);
      const result = await applyFileEdits(validPath, args.edits, args.dryRun);
      return {
        content: [{ type: "text" as const, text: result }],
        structuredContent: { content: result },
      };
    },
  );

  server.registerTool(
    "create_directory",
    {
      title: "Create Directory",
      description:
        "Create a new directory or ensure a directory exists. Can create multiple " +
        "nested directories in one operation. If the directory already exists, " +
        "this operation will succeed silently. Perfect for setting up directory " +
        "structures for projects or ensuring required paths exist. Only works within allowed directories.",
      inputSchema: jsonSchema2020(CreateDirectoryArgsSchema.shape),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args: z.infer<typeof CreateDirectoryArgsSchema>) => {
      const validPath = await validatePath(args.path, allowedDirectories);
      await fs.mkdir(validPath, { recursive: true });
      const text = `Successfully created directory ${args.path}`;
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { content: text },
      };
    },
  );

  server.registerTool(
    "list_directory",
    {
      title: "List Directory",
      description:
        "Get a detailed listing of all files and directories in a specified path. " +
        "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
        "prefixes. This tool is essential for understanding directory structure and " +
        "finding specific files within a directory. Only works within allowed directories.",
      inputSchema: jsonSchema2020(ListDirectoryArgsSchema.shape),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args: z.infer<typeof ListDirectoryArgsSchema>) => {
      const validPath = await validatePath(args.path, allowedDirectories);
      const entries = await fs.readdir(validPath, { withFileTypes: true });
      const formatted = entries
        .map(
          (entry) =>
            `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`,
        )
        .join("\n");
      return {
        content: [{ type: "text" as const, text: formatted }],
        structuredContent: { content: formatted },
      };
    },
  );

  server.registerTool(
    "list_directory_with_sizes",
    {
      title: "List Directory with Sizes",
      description:
        "Get a detailed listing of all files and directories in a specified path, including sizes. " +
        "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
        "prefixes. This tool is useful for understanding directory structure and " +
        "finding specific files within a directory. Only works within allowed directories.",
      inputSchema: jsonSchema2020(ListDirectoryWithSizesArgsSchema.shape),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args: z.infer<typeof ListDirectoryWithSizesArgsSchema>) => {
      const validPath = await validatePath(args.path, allowedDirectories);
      const entries = await fs.readdir(validPath, { withFileTypes: true });

      // Get detailed information for each entry
      const detailedEntries = await Promise.all(
        entries.map(async (entry) => {
          const entryPath = path.join(validPath, entry.name);
          try {
            const stats = await fs.stat(entryPath);
            return {
              name: entry.name,
              isDirectory: entry.isDirectory(),
              size: stats.size,
              mtime: stats.mtime,
            };
          } catch {
            return {
              name: entry.name,
              isDirectory: entry.isDirectory(),
              size: 0,
              mtime: new Date(0),
            };
          }
        }),
      );

      // Sort entries based on sortBy parameter
      const sortedEntries = [...detailedEntries].sort((a, b) => {
        if (args.sortBy === "size") {
          return b.size - a.size; // Descending by size
        }
        // Default sort by name
        return a.name.localeCompare(b.name);
      });

      // Format the output
      const formattedEntries = sortedEntries.map(
        (entry) =>
          `${entry.isDirectory ? "[DIR]" : "[FILE]"} ${entry.name.padEnd(30)} ${
            entry.isDirectory ? "" : formatSize(entry.size).padStart(10)
          }`,
      );

      // Add summary
      const totalFiles = detailedEntries.filter((e) => !e.isDirectory).length;
      const totalDirs = detailedEntries.filter((e) => e.isDirectory).length;
      const totalSize = detailedEntries.reduce(
        (sum, entry) => sum + (entry.isDirectory ? 0 : entry.size),
        0,
      );

      const summary = [
        "",
        `Total: ${totalFiles} files, ${totalDirs} directories`,
        `Combined size: ${formatSize(totalSize)}`,
      ];

      const text = [...formattedEntries, ...summary].join("\n");
      const contentBlock = { type: "text" as const, text };
      return {
        content: [contentBlock],
        structuredContent: { content: text },
      };
    },
  );

  server.registerTool(
    "directory_tree",
    {
      title: "Directory Tree",
      description:
        "Get a recursive tree view of files and directories as a JSON structure. " +
        "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
        "Files have no children array, while directories always have a children array (which may be empty). " +
        "The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
      inputSchema: jsonSchema2020(DirectoryTreeArgsSchema.shape),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args: z.infer<typeof DirectoryTreeArgsSchema>) => {
      interface TreeEntry {
        name: string;
        type: "file" | "directory";
        children?: TreeEntry[];
      }
      const rootPath = args.path;

      async function buildTree(
        currentPath: string,
        excludePatterns: string[] = [],
      ): Promise<TreeEntry[]> {
        const validPath = await validatePath(currentPath, allowedDirectories);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const result: TreeEntry[] = [];

        for (const entry of entries) {
          const relativePath = path.relative(
            rootPath,
            path.join(currentPath, entry.name),
          );
          const shouldExclude = excludePatterns.some((pattern) => {
            if (pattern.includes("*")) {
              return minimatch(relativePath, pattern, { dot: true });
            }
            // For files: match exact name or as part of path
            // For directories: match as directory path
            return (
              minimatch(relativePath, pattern, { dot: true }) ||
              minimatch(relativePath, `**/${pattern}`, { dot: true }) ||
              minimatch(relativePath, `**/${pattern}/**`, { dot: true })
            );
          });
          if (shouldExclude) continue;

          const entryData: TreeEntry = {
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
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
      const contentBlock = { type: "text" as const, text };
      return {
        content: [contentBlock],
        structuredContent: { content: text },
      };
    },
  );

  server.registerTool(
    "move_file",
    {
      title: "Move File",
      description:
        "Move or rename files and directories. Can move files between directories " +
        "and rename them in a single operation. If the destination exists, the " +
        "operation will fail. Works across different directories and can be used " +
        "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
      inputSchema: jsonSchema2020(MoveFileArgsSchema.shape),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
    },
    async (args: z.infer<typeof MoveFileArgsSchema>) => {
      const validSourcePath = await validatePath(
        args.source,
        allowedDirectories,
      );
      const validDestPath = await validatePath(
        args.destination,
        allowedDirectories,
      );
      await moveFile(validSourcePath, validDestPath);
      const text = `Successfully moved ${args.source} to ${args.destination}`;
      const contentBlock = { type: "text" as const, text };
      return {
        content: [contentBlock],
        structuredContent: { content: text },
      };
    },
  );

  server.registerTool(
    "search_files",
    {
      title: "Search Files",
      description:
        "Recursively search for files and directories matching a pattern. " +
        "The patterns should be glob-style patterns that match paths relative to the working directory. " +
        "Use pattern like '*.ext' to match files in current directory, and '**/*.ext' to match files in all subdirectories. " +
        "Returns full paths to all matching items. Great for finding files when you don't know their exact location. " +
        "Only searches within allowed directories.",
      inputSchema: jsonSchema2020(SearchFilesArgsSchema.shape),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args: z.infer<typeof SearchFilesArgsSchema>) => {
      const validPath = await validatePath(args.path, allowedDirectories);
      const results = await searchFilesWithValidation(
        validPath,
        args.pattern,
        allowedDirectories,
        { excludePatterns: args.excludePatterns },
      );
      const text = results.length > 0 ? results.join("\n") : "No matches found";
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { content: text },
      };
    },
  );

  server.registerTool(
    "get_file_info",
    {
      title: "Get File Info",
      description:
        "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
        "information including size, creation time, last modified time, permissions, " +
        "and type. This tool is perfect for understanding file characteristics " +
        "without reading the actual content. Only works within allowed directories.",
      inputSchema: jsonSchema2020(GetFileInfoArgsSchema.shape),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args: z.infer<typeof GetFileInfoArgsSchema>) => {
      const validPath = await validatePath(args.path, allowedDirectories);
      const info = await getFileStats(validPath);
      const text = Object.entries(info)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { content: text },
      };
    },
  );

  server.registerTool(
    "list_allowed_directories",
    {
      title: "List Allowed Directories",
      description:
        "Returns the list of directories that this server is allowed to access. " +
        "Subdirectories within these allowed directories are also accessible. " +
        "Use this to understand which directories and their nested paths are available " +
        "before trying to access files.",
      inputSchema: jsonSchema2020({}),
      outputSchema: jsonSchema2020({ content: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const text = `Allowed directories:\n${allowedDirectories.join("\n")}`;
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { content: text },
      };
    },
  );

  // Updates allowed directories based on MCP client roots, unless a newer
  // refresh started after this one's `generation` was taken (#5097).
  async function updateAllowedDirectoriesFromRoots(
    requestedRoots: Root[],
    generation: number,
  ) {
    const validatedRootDirs = await getValidRootDirectories(requestedRoots);
    if (generation !== rootsGeneration) {
      console.error(
        "Discarded a stale roots/list answer: a newer roots update has started",
      );
      return;
    }
    if (validatedRootDirs.length > 0) {
      allowedDirectories = [...validatedRootDirs];
      rootsInForce = true;
      console.error(
        `Updated allowed directories from MCP roots: ${validatedRootDirs.length} valid directories`,
      );
    } else if (rootsInForce) {
      allowedDirectories = [];
      console.error(
        "No valid root directories provided by client; access revoked until it exposes a root again",
      );
    } else {
      console.error("No valid root directories provided by client");
    }
  }

  // Handles dynamic roots updates during runtime, when client sends "roots/list_changed" notification, server fetches the updated roots and replaces all allowed directories with the new roots.
  server.server.setNotificationHandler(
    RootsListChangedNotificationSchema,
    async () => {
      const generation = ++rootsGeneration;
      const refresh = (async () => {
        try {
          // Request the updated roots list from the client
          const response = await server.server.listRoots();
          /* v8 ignore else -- the SDK validates the roots/list result against ListRootsResultSchema, which requires roots, so the implicit else cannot run */
          if (response && "roots" in response) {
            await updateAllowedDirectoriesFromRoots(response.roots, generation);
          }
        } catch (error) {
          console.error(
            "Failed to request roots from client:",
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          if (generation === rootsGeneration) initialRootsPending = false;
        }
      })();
      // Overtaking the initial load: tool calls wait for this refresh instead.
      if (initialRootsPending) initialization = refresh;
      await refresh;
    },
  );

  // Handles post-initialization setup, specifically checking for and fetching
  // MCP roots. Tool calls wait for it (see `initialization` above).
  server.server.oninitialized = () => {
    initialization = initialize();
  };

  async function initialize(): Promise<void> {
    const clientCapabilities = server.server.getClientCapabilities();

    if (clientCapabilities?.roots) {
      const generation = ++rootsGeneration;
      initialRootsPending = true;
      try {
        const response = await server.server.listRoots();
        /* v8 ignore else -- the SDK validates the roots/list result against ListRootsResultSchema, which requires roots, so the else cannot run */
        if (response && "roots" in response) {
          await updateAllowedDirectoriesFromRoots(response.roots, generation);
        } else {
          console.error(
            "Client returned no roots set, keeping current settings",
          );
        }
      } catch (error) {
        console.error(
          "Failed to request initial roots from client:",
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        if (generation === rootsGeneration) initialRootsPending = false;
      }
    } else {
      if (allowedDirectories.length > 0) {
        console.error(
          "Client does not support MCP Roots, using allowed directories set from server args:",
          allowedDirectories,
        );
      } else {
        // Nothing could ever be allowed in this session, so fail visibly
        // rather than serve every call with "Access denied" (#4992): log the
        // reason and close the connection. Throwing here would only reach the
        // SDK's onerror, which the client never sees.
        const error = new Error(NO_ALLOWED_DIRECTORIES_ERROR);
        console.error(`Error: ${error.message}`);
        await server.close();
        options.onCannotOperate?.(error);
      }
    }
  }

  return server;
}
