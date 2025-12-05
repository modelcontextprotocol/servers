import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDynamicResources } from "./dynamic.js";
import { registerStaticResources } from "./static.js";

/**
 * Register the resources with the MCP server.
 * @param server
 */
export const registerResources = (server: McpServer) => {
  registerDynamicResources(server);
  registerStaticResources(server);
};
