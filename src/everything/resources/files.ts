import { McpServer, type CacheHint } from "@modelcontextprotocol/server";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readdirSync, readFileSync, statSync } from "fs";

/** How long a client or shared cache may keep a static document. */
export const STATIC_DOCUMENT_CACHE_HINT: CacheHint = {
  ttlMs: 60 * 60_000,
  cacheScope: "public",
};

/**
 * Register static file resources
 * - Each file in src/everything/docs is exposed as an individual static resource
 * - URIs follow the pattern: "demo://static/docs/<filename>"
 * - Markdown (.md) files are served as mime type "text/markdown"
 * - Text (.txt) files are served as mime type "text/plain"
 * - JSON (.json) files are served as mime type "application/json"
 *
 * @param server
 */
export const registerFileResources = (server: McpServer) => {
  // Read the entries in the docs directory
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const docsDir = join(__dirname, "..", "docs");
  let entries: string[];
  try {
    entries = readdirSync(docsDir);
  } catch {
    // If docs/ folder is missing or unreadable, just skip registration
    return;
  }

  // Register each file as a static resource
  for (const name of entries) {
    // Only process files, not directories
    const fullPath = join(docsDir, name);
    try {
      const st = statSync(fullPath);
      if (!st.isFile()) continue;
    } catch {
      continue;
    }

    // Prepare file resource info
    const uri = `demo://resource/static/document/${encodeURIComponent(name)}`;
    const mimeType = getMimeType(name);
    const description = `Static document file exposed from /docs: ${name}`;

    // Register file resource
    server.registerResource(
      name,
      uri,
      // A static document changes only when the server is upgraded, so any
      // cache may keep it for an hour (2026-07-28 clients only; #4852).
      { mimeType, description, cacheHint: STATIC_DOCUMENT_CACHE_HINT },
      async (uri) => {
        const text = readFileSafe(fullPath);
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType,
              text,
            },
          ],
        };
      },
    );
  }
};

/**
 * Get the mimetype based on filename
 * @param fileName
 */
function getMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown"))
    return "text/markdown";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".json")) return "application/json";
  return "text/plain";
}

/**
 * Read a file or return an error message if it fails
 * @param path
 */
function readFileSafe(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch (e) {
    return `Error reading file: ${path}. ${e}`;
  }
}
