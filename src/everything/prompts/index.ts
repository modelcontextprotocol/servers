import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addSimplePrompt } from "./simple.js";
import { addComplexPrompt } from "./complex.js";
import { addPromptWithCompletions } from "./completions.js";

/**
 * Register the prompts with the MCP server.
 * @param server
 */
export const registerPrompts = (server: McpServer) => {
  addSimplePrompt(server);
  addComplexPrompt(server);
  addPromptWithCompletions(server);
};
