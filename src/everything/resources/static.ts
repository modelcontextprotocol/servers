import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readdirSync, readFileSync, statSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Register static resources for each file in the docs folder.
 *
 * - Each file in src/everything/docs is exposed as an individual static resource
 * - URIs follow the pattern: "demo://static/docs/<filename>"
 * - Markdown files are served as text/markdown; others as text/plain
 *
 * @param server
 */
export const registerStaticResources = (server: McpServer) => {
  const docsDir = join(__dirname, "..", "docs");

  let entries: string[] = [];
  try {
    entries = readdirSync(docsDir);
  } catch (e) {
    // If docs folder is missing or unreadable, just skip registration
    return;
  }

  for (const name of entries) {
    const fullPath = join(docsDir, name);
    try {
      const st = statSync(fullPath);
      if (!st.isFile()) continue;
    } catch {
      continue;
    }

    const uri = `demo://resource/static/document/${encodeURIComponent(name)}`;
    const mimeType = getMimeType(name);
    const displayName = `Docs: ${name}`;
    const description = `Static document file exposed from /docs: ${name}`;

    server.registerResource(
      displayName,
      uri,
      { mimeType, description },
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
      }
    );
  }
};

function getMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown"))
    return "text/markdown";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".json")) return "application/json";
  return "text/plain";
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch (e) {
    return `Error reading file: ${path}. ${e}`;
  }
}
