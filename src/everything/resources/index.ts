import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addDynamicResources } from "./dynamic.js";


/**
 * Register the resources with the MCP server.
 * @param server
 */
export const registerResources = (server: McpServer) => {
    addDynamicResources(server);
};
