import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetAnnotatedMessageTool } from "./get-annotated-message.js";
import { registerEchoTool } from "./echo.js";
import { registerGetEnvTool } from "./get-env.js";
import { registerGetResourceLinksTool } from "./get-resource-links.js";
import { registerGetResourceReferenceTool } from "./get-resource-reference.js";
import { registerGetRootsListTool } from "./get-roots-list.js";
import { registerGetStructuredContentTool } from "./get-structured-content.js";
import { registerGetSumTool } from "./get-sum.js";
import { registerGetTinyImageTool } from "./get-tiny-image.js";
import { registerGZipFileAsResourceTool } from "./gzip-file-as-resource.js";
import { registerToggleSimulatedLoggingTool } from "./toggle-simulated-logging.js";
import { registerToggleSubscriberUpdatesTool } from "./toggle-subscriber-updates.js";
import { registerTriggerElicitationRequestTool } from "./trigger-elicitation-request.js";
import { registerTriggerLongRunningOperationTool } from "./trigger-long-running-operation.js";
import { registerTriggerSamplingRequestTool } from "./trigger-sampling-request.js";
import { registerTriggerSamplingRequestAsyncTool } from "./trigger-sampling-request-async.js";
import { registerTriggerElicitationRequestAsyncTool } from "./trigger-elicitation-request-async.js";
import { registerSimulateResearchQueryTool } from "./simulate-research-query.js";

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
  registerGetStructuredContentTool(server);
  registerGetSumTool(server);
  registerGetTinyImageTool(server);
  registerGZipFileAsResourceTool(server);
  registerToggleSimulatedLoggingTool(server);
  registerToggleSubscriberUpdatesTool(server);
  registerTriggerLongRunningOperationTool(server);
};

/**
 * Register the tools that are conditional upon client capabilities.
 * These must be registered conditionally, after initialization.
 */
export const registerConditionalTools = (server: McpServer) => {
  registerGetRootsListTool(server);
  registerTriggerElicitationRequestTool(server);
  registerTriggerSamplingRequestTool(server);
  // Task-based research tool (uses experimental tasks API)
  registerSimulateResearchQueryTool(server);
  // Bidirectional task tools - server sends requests that client executes as tasks
  registerTriggerSamplingRequestAsyncTool(server);
  registerTriggerElicitationRequestAsyncTool(server);
};
