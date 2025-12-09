import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAddTool } from "./add.js";
import { registerEchoTool } from "./echo.js";
import { registerGetTinyImageTool } from "./get-tiny-image.js";
import { registerLongRunningOperationTool } from "./long-running-operation.js";
import { registerPrintEnvTool } from "./print-env.js";
import { registerSamplingRequestTool } from "./sampling-request.js";
import { registerToggleLoggingTool } from "./toggle-logging.js";
import { registerToggleSubscriberUpdatesTool } from "./toggle-subscriber-updates.js";

/**
 * Register the tools with the MCP server.
 * @param server
 */
export const registerTools = (server: McpServer) => {
  registerAddTool(server);
  registerEchoTool(server);
  registerGetTinyImageTool(server);
  registerLongRunningOperationTool(server);
  registerPrintEnvTool(server);
  registerSamplingRequestTool(server);
  registerToggleLoggingTool(server);
  registerToggleSubscriberUpdatesTool(server);
};
