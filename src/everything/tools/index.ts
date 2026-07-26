import { McpServer } from "@modelcontextprotocol/server";
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
import { registerSimulateResearchQueryTool } from "./simulate-research-query.js";
import { registerTriggerUrlElicitationTool } from "./trigger-url-elicitation.js";

/**
 * Register the tools with the MCP server.
 *
 * There is deliberately no second "conditional tools" pass here any more. The
 * old split existed because the tools that need elicitation / sampling / roots
 * had to wait for the `initialize` handshake to learn the client's
 * capabilities. 2026-07-28 has no handshake, and it does not need one: those
 * tools now *return* `inputRequired(...)`, and the SDK refuses an embedded
 * request with `-32021 MissingRequiredClientCapabilityError` at dispatch when
 * the caller never declared the capability. That gate runs on both eras, so
 * every tool can be registered up front, unconditionally.
 *
 * Tools listed here are era-agnostic: each is written once and served to 2025-
 * and modern-era clients alike.
 *
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
  registerSimulateResearchQueryTool(server);
  registerToggleSimulatedLoggingTool(server);
  registerToggleSubscriberUpdatesTool(server);
  registerTriggerElicitationRequestTool(server);
  registerTriggerLongRunningOperationTool(server);
  registerTriggerSamplingRequestTool(server);
  registerTriggerUrlElicitationTool(server);
};
