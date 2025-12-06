import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResourceTemplates } from "./template.js";
import { registerStaticResources } from "./static.js";

/**
 * Register the resources with the MCP server.
 * @param server
 */
export const registerResources = (server: McpServer) => {
  registerResourceTemplates(server);
  registerStaticResources(server);
};
