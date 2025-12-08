import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEchoTool } from "./echo.js";
import { registerAddTool } from "./add.js";
import { registerToggleLoggingTool } from "./toggle-logging.js";
import { registerToggleSubscriberUpdatesTool } from "./toggle-subscriber-updates.js";
import { registerLongRunningOperationTool } from "./long-running-operation.js";

/**
 * Register the tools with the MCP server.
 * @param server
 */
export const registerTools = (server: McpServer) => {
  registerEchoTool(server);
  registerAddTool(server);
  registerToggleLoggingTool(server);
  registerToggleSubscriberUpdatesTool(server);
  registerLongRunningOperationTool(server);
};
