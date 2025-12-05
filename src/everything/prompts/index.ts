import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSimplePrompt } from "./simple.js";
import { registerComplexPrompt } from "./complex.js";
import { registerPromptWithCompletions } from "./completions.js";

/**
 * Register the prompts with the MCP server.
 * @param server
 */
export const registerPrompts = (server: McpServer) => {
  registerSimplePrompt(server);
  registerComplexPrompt(server);
  registerPromptWithCompletions(server);
};
