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
import { registerFileOperationsTool } from "./file-operations.js";
import { registerStringOperationsTool } from "./string-operations.js";
import { registerMathOperationsTool } from "./math-operations.js";
import { registerDateTimeOperationsTool } from "./datetime-operations.js";
import { registerDataAnalysisTool } from "./data-analysis.js";
import { registerValidationTool } from "./validation.js";

/**
 * Register all tools with MCP server.
 * @param server
 */
export const registerTools = (server: McpServer) => {
  registerEchoTool(server);
  registerGetAnnotatedMessageTool(server);
  registerGetEnvTool(server);
  registerGetResourceLinksTool(server);
  registerGetResourceReferenceTool(server);
  registerGetRootsListTool(server);
  registerGetStructuredContentTool(server);
  registerGetSumTool(server);
  registerGetTinyImageTool(server);
  registerGZipFileAsResourceTool(server);
  registerToggleSimulatedLoggingTool(server);
  registerToggleSubscriberUpdatesTool(server);
  registerTriggerElicitationRequestTool(server);
  registerTriggerLongRunningOperationTool(server);
  registerTriggerSamplingRequestTool(server);
  registerFileOperationsTool(server);
  registerStringOperationsTool(server);
  registerMathOperationsTool(server);
  registerDateTimeOperationsTool(server);
  registerDataAnalysisTool(server);
  registerValidationTool(server);
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
