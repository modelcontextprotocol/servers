import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addToolEcho } from "./echo.js";

/**
 * Register the tools with the MCP server.
 * @param server
 */
export const registerTools = (server: McpServer) => {
  addToolEcho(server);
};
