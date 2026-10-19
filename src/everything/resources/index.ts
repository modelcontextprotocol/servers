import { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../server/context.js";
import { registerResourceTemplates } from "./templates.js";
import { registerFileResources } from "./files.js";
import { registerMintedResources } from "./minted.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

/**
 * Register the resources with the MCP server. A 2026-07-28 server also serves
 * the resources tools mint for later reading (see minted.ts).
 * @param server
 * @param context
 */
export const registerResources = (
  server: McpServer,
  context: ServerContext,
) => {
  registerResourceTemplates(server);
  registerFileResources(server);
  if (context.era === "modern") registerMintedResources(server);
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
