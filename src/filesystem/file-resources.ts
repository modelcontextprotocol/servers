// Files as MCP resources (#297). The server exposes one resource template,
// `file://{+path}`, so a client can read any file inside the allowed
// directories with resources/read and get it back as text or as a base64 blob
// with its MIME type, instead of only through the read tools. A resource is
// read by the client application, which can put it in model context or show it
// to the user, rather than returned inside a tool result the model must relay.
//
// The template has no list callback, on purpose: resources/list stays empty, so
// the server never enumerates the disk. A client reaches a file by building its
// URI from the template (or from a path a tool returned), and every read goes
// through the same validatePath as the tools, so a resource can reach nothing a
// tool cannot: no path outside the allowed directories, and no symlink whose
// target is outside them.
//
// It lives in a module of its own, registered from createServer() with one
// call, so the server factory's tool code is untouched. The factory hands it
// the live allow-list, the roots barrier and the reason a 2026-07-28
// connection with no directories cannot operate, so a read sees the same
// directories, at the same moment, as a tool call would.
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  ResourceNotFoundError,
  ResourceTemplate,
} from "@modelcontextprotocol/server";
import type { ReadResourceResult } from "@modelcontextprotocol/server";
import { validatePath } from "./lib.js";

/** The URI template every file resource matches (RFC 6570 reserved expansion). */
export const FILE_RESOURCE_TEMPLATE = "file://{+path}";

/** MIME types by lowercase extension; anything else is sniffed (see below). */
const MIME_TYPES: Readonly<Record<string, string>> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/typescript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
};

/** MIME types outside text/* whose content is still text. */
const TEXTUAL_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/yaml",
  "image/svg+xml",
]);

function isTextualMimeType(mimeType: string): boolean {
  return mimeType.startsWith("text/") || TEXTUAL_MIME_TYPES.has(mimeType);
}

/** The bytes as UTF-8 text, or undefined when they are not valid UTF-8 text. */
function decodeText(bytes: Buffer): string | undefined {
  // A NUL byte is valid UTF-8 but marks binary content in practice.
  if (bytes.includes(0)) return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * The contents of one file resource: text when its type is textual (or, for an
 * unknown extension, when its bytes decode as UTF-8), a base64 blob otherwise.
 */
export function fileResourceContents(
  uri: string,
  filePath: string,
  bytes: Buffer,
): ReadResourceResult["contents"][number] {
  const known = MIME_TYPES[path.extname(filePath).toLowerCase()];
  if (known === undefined || isTextualMimeType(known)) {
    const text = decodeText(bytes);
    if (text !== undefined) {
      return { uri, mimeType: known ?? "text/plain", text };
    }
  }
  return {
    uri,
    mimeType: known ?? "application/octet-stream",
    blob: bytes.toString("base64"),
  };
}

export interface FileResourceContext {
  /** The directories reads are confined to, read at the moment of each read. */
  allowedDirectories: () => readonly string[];
  /**
   * The current roots barrier: settles when no roots refresh is pending. It
   * is read again after it settles, since a newer refresh can replace it.
   */
  rootsSettled: () => Promise<void>;
  /** Why the server cannot serve a read at all right now, if it cannot. */
  unavailableReason: () => string | undefined;
}

/** Register the `file://{+path}` resource template on `server`. */
export function registerFileResources(
  server: McpServer,
  context: FileResourceContext,
): void {
  server.registerResource(
    "file",
    new ResourceTemplate(FILE_RESOURCE_TEMPLATE, { list: undefined }),
    {
      title: "File",
      description:
        "A file inside the allowed directories, by its absolute file:// URI " +
        "(for example file:///home/user/project/README.md). Text files are " +
        "returned as text, other files as a base64 blob with their MIME type. " +
        "Directories are not resources; use the list_directory tool to find files.",
      // A file can change at any time, and its contents belong to this user.
      cacheHint: { ttlMs: 0, cacheScope: "private" },
    },
    async (uri): Promise<ReadResourceResult> => {
      // Wait out a pending roots refresh, as tool calls do, so a read is
      // checked against the directories that refresh brings in.
      let settled: Promise<void>;
      do {
        settled = context.rootsSettled();
        await settled;
      } while (settled !== context.rootsSettled());

      const unavailable = context.unavailableReason();
      if (unavailable !== undefined) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, unavailable);
      }

      let requestedPath: string;
      try {
        requestedPath = fileURLToPath(uri);
      } catch (error) {
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          `Invalid file URI ${uri.href}: ${(error as Error).message}`,
        );
      }

      let validPath: string;
      try {
        validPath = await validatePath(
          requestedPath,
          context.allowedDirectories(),
        );
      } catch (error) {
        // Outside the allowed directories, a symlink out of them, or a parent
        // that does not exist: the message says which, as the tools do.
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          (error as Error).message,
        );
      }

      let bytes: Buffer;
      try {
        bytes = await fs.readFile(validPath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") throw new ResourceNotFoundError(uri.href);
        if (code === "EISDIR") {
          throw new ResourceNotFoundError(
            uri.href,
            `Not a file: ${uri.href} is a directory; directories are not resources`,
          );
        }
        throw new ProtocolError(
          ProtocolErrorCode.InternalError,
          `Failed to read ${uri.href}: ${(error as Error).message}`,
        );
      }
      return { contents: [fileResourceContents(uri.href, validPath, bytes)] };
    },
  );
}
