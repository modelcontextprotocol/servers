// Registers the everything server's tools, grouped by the protocol era that
// gets them (#4852):
// - `registerTools`: every client, on either era.
// - `registerLegacyTools`: 2025-era clients only, for the deprecated features
//   the 2026-07-28 revision removes (`logging/setLevel`, `resources/subscribe`).
// - `registerConditionalTools`: 2025-era clients that declared the capability
//   a tool needs; called once `initialize` has told the server what the client
//   supports.
// - `registerModernTools`: 2026-07-28 clients. Their capabilities arrive with
//   each request, so the capability-gated tools are registered up front and the
//   SDK refuses an embedded request the client did not declare (-32021); the
//   task tools are served only here, on the tasks extension.

import { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../server/context.js";
import { registerGetAnnotatedMessageTool } from "./get-annotated-message.js";
import { registerEchoTool } from "./echo.js";
import { registerGetEnvTool } from "./get-env.js";
import { registerGetHeaderParamsTool } from "./get-header-params.js";
import { registerGetResourceLinksTool } from "./get-resource-links.js";
import { registerGetResourceReferenceTool } from "./get-resource-reference.js";
import { registerGetRootsListTool } from "./get-roots-list.js";
import { registerGetStructuredContentTool } from "./get-structured-content.js";
import { registerGetSumTool } from "./get-sum.js";
import { registerGetTinyImageTool } from "./get-tiny-image.js";
import { registerGZipFileAsResourceTool } from "./gzip-file-as-resource.js";
import { registerSimulateResearchQueryTool } from "./simulate-research-query.js";
import { registerToggleSimulatedLoggingTool } from "./toggle-simulated-logging.js";
import { registerToggleSubscriberUpdatesTool } from "./toggle-subscriber-updates.js";
import { registerTriggerElicitationRequestAsyncTool } from "./trigger-elicitation-request-async.js";
import { registerTriggerElicitationRequestTool } from "./trigger-elicitation-request.js";
import { registerTriggerListChangedTool } from "./trigger-list-changed.js";
import { registerTriggerLogMessagesTool } from "./trigger-log-messages.js";
import { registerTriggerLongRunningOperationTool } from "./trigger-long-running-operation.js";
import { registerTriggerMultiStepElicitationTool } from "./trigger-multi-step-elicitation.js";
import { registerTriggerResourceUpdateTool } from "./trigger-resource-update.js";
import { registerTriggerSamplingRequestAsyncTool } from "./trigger-sampling-request-async.js";
import { registerTriggerSamplingRequestTool } from "./trigger-sampling-request.js";
import { registerTriggerUrlElicitationTool } from "./trigger-url-elicitation.js";

/**
 * Register the tools every client gets, on either protocol era.
 * @param server
 * @param context
 */
export const registerTools = (server: McpServer, context: ServerContext) => {
  registerEchoTool(server);
  registerGetAnnotatedMessageTool(server);
  registerGetEnvTool(server);
  registerGetHeaderParamsTool(server);
  registerGetResourceLinksTool(server);
  registerGetResourceReferenceTool(server);
  registerGetStructuredContentTool(server);
  registerGetSumTool(server);
  registerGetTinyImageTool(server);
  registerGZipFileAsResourceTool(server, context);
  registerTriggerListChangedTool(server, context);
  registerTriggerLogMessagesTool(server);
  registerTriggerLongRunningOperationTool(server);
  registerTriggerResourceUpdateTool(server, context);
};

/**
 * Register the deprecated tools that only a 2025-era client gets, because
 * they rely on methods the 2026-07-28 revision removes.
 * @param server
 * @param context
 */
export const registerLegacyTools = (
  server: McpServer,
  context: ServerContext,
) => {
  registerToggleSimulatedLoggingTool(server, context);
  registerToggleSubscriberUpdatesTool(server, context);
};

/**
 * Register the tools that need a client capability, for a 2025-era client
 * that declared it. These must be registered after initialization, when the
 * client's capabilities are known.
 * @param server
 * @param context
 */
export const registerConditionalTools = (
  server: McpServer,
  context: ServerContext,
) => {
  const capabilities = server.server.getClientCapabilities() || {};
  const elicitation = capabilities.elicitation;
  // Form mode is `elicitation.form`, or `elicitation` with neither mode,
  // which the spec treats as form mode for backwards compatibility (#4985).
  const supportsFormElicitation =
    elicitation !== undefined &&
    (elicitation.form !== undefined || elicitation.url === undefined);

  if (capabilities.roots !== undefined) registerGetRootsListTool(server);
  if (supportsFormElicitation) {
    registerTriggerElicitationRequestTool(server);
    registerTriggerMultiStepElicitationTool(server);
  }
  if (elicitation?.url !== undefined) {
    registerTriggerUrlElicitationTool(server, context);
  }
  if (capabilities.sampling !== undefined) {
    registerTriggerSamplingRequestTool(server);
  }
};

/**
 * Register the tools a 2026-07-28 client gets beyond the common ones: the
 * capability-gated tools, registered up front, and the task tools.
 * @param server
 * @param context
 */
export const registerModernTools = (
  server: McpServer,
  context: ServerContext,
) => {
  registerGetRootsListTool(server);
  registerTriggerElicitationRequestTool(server);
  registerTriggerMultiStepElicitationTool(server);
  registerTriggerUrlElicitationTool(server, context);
  registerTriggerSamplingRequestTool(server);
  registerSimulateResearchQueryTool(server);
  registerTriggerSamplingRequestAsyncTool(server);
  registerTriggerElicitationRequestAsyncTool(server);
};
