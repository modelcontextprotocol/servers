import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEchoTool } from "./echo.js";
import { registerAddTool } from "./add.js";

/**
 * Register the tools with the MCP server.
 * @param server
 */
export const registerTools = (server: McpServer) => {
  registerEchoTool(server);
  registerAddTool(server);
};
