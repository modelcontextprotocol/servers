import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAddTool } from "./add.js";
import { registerAnnotatedMessageTool } from "./annotated-message.js";
import { registerEchoTool } from "./echo.js";
import { registerGetEnvTool } from "./get-env.js";
import { registerGetResourceLinksTool } from "./get-resource-links.js";
import { registerGetResourceReferenceTool } from "./get-resource-reference.js";
import { registerGetTinyImageTool } from "./get-tiny-image.js";
import { registerLongRunningOperationTool } from "./long-running-operation.js";
import { registerSamplingRequestTool } from "./sampling-request.js";
import { registerToggleLoggingTool } from "./toggle-logging.js";
import { registerToggleSubscriberUpdatesTool } from "./toggle-subscriber-updates.js";
import { registerGetStructuredContentTool } from "./get-structured-content.js";

/**
 * Register the tools with the MCP server.
 * @param server
 */
export const registerTools = (server: McpServer) => {
  registerAddTool(server);
  registerAnnotatedMessageTool(server);
  registerEchoTool(server);
  registerGetEnvTool(server);
  registerGetResourceLinksTool(server);
  registerGetResourceReferenceTool(server);
  registerGetStructuredContentTool(server);
  registerGetTinyImageTool(server);
  registerLongRunningOperationTool(server);
  registerSamplingRequestTool(server);
  registerToggleLoggingTool(server);
  registerToggleSubscriberUpdatesTool(server);
};
