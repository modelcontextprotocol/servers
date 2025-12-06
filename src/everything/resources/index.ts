import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResourceTemplates } from "./templates.js";
import { registerFileResources } from "./files.js";

/**
 * Register the resources with the MCP server.
 * @param server
 */
export const registerResources = (server: McpServer) => {
  registerResourceTemplates(server);
  registerFileResources(server);
};
