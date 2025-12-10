import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetAnnotatedMessageTool } from "./get-annotated-message.js";
import { registerEchoTool } from "./echo.js";
import { registerGetEnvTool } from "./get-env.js";
import { registerGetResourceLinksTool } from "./get-resource-links.js";
import { registerGetResourceReferenceTool } from "./get-resource-reference.js";
import { registerGetSamplingRequestTool } from "./get-sampling-request.js";
import { registerGetStructuredContentTool } from "./get-structured-content.js";
import { registerGetSumTool } from "./get-sum.js";
import { registerGetTinyImageTool } from "./get-tiny-image.js";
import { registerLongRunningOperationTool } from "./long-running-operation.js";
import { registerToggleLoggingTool } from "./toggle-logging.js";
import { registerToggleSubscriberUpdatesTool } from "./toggle-subscriber-updates.js";

/**
 * Register the tools with the MCP server.
 * @param server
 */
export const registerTools = (server: McpServer) => {
  registerEchoTool(server);
  registerGetAnnotatedMessageTool(server);
  registerGetEnvTool(server);
  registerGetResourceLinksTool(server);
  registerGetResourceReferenceTool(server);
  registerGetSamplingRequestTool(server);
  registerGetStructuredContentTool(server);
  registerGetSumTool(server);
  registerGetTinyImageTool(server);
  registerLongRunningOperationTool(server);
  registerToggleLoggingTool(server);
  registerToggleSubscriberUpdatesTool(server);
};
