import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResourceTemplates } from "./templates.js";
import { registerFileResources } from "./files.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

/**
 * Register the resources with the MCP server.
 * @param server
 */
export const registerResources = (server: McpServer) => {
  registerResourceTemplates(server);
  registerFileResources(server);
};

/**
 * Reads the server instructions from the corresponding markdown file.
 * Attempts to load the content of the file located in the `docs` directory.
 * If the file cannot be loaded, an error message is returned instead.
 *
 * @return {string} The content of the server instructions file, or an error message if reading fails.
 */
export function readInstructions(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const filePath = join(__dirname, "..", "docs", "instructions.md");
  let instructions;

  try {
    instructions = readFileSync(filePath, "utf-8");
  } catch (e) {
    instructions = "Server instructions not loaded: " + e;
  }
  return instructions;
}
