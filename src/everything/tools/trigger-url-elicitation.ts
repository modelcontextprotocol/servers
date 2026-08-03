import { randomUUID } from "node:crypto";
import {
  McpServer,
  CallToolResult,
  InputRequiredResult,
  inputRequired,
  inputResponse,
} from "@modelcontextprotocol/server";
import { z } from "zod";

// Tool input schema
const TriggerUrlElicitationSchema = z.object({
  url: z.string().url().describe("The URL the user should open"),
  message: z
    .string()
    .default("Please open the link to complete this action.")
    .describe("Message shown to the user before opening the URL"),
  elicitationId: z
    .string()
    .optional()
    .describe(
      "Optional correlation ID echoed back in the result. Defaults to a random UUID."
    ),
});

// Tool configuration
const name = "trigger-url-elicitation";
const config = {
  title: "Trigger URL Elicitation Tool",
  description:
    "Trigger a URL elicitation so the client can direct the user to a browser flow. " +
    "The tool asks for the elicitation by returning an input-required result; the client " +
    "opens the URL, collects the outcome, and retries the call with the response.",
  inputSchema: TriggerUrlElicitationSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

// Key for this tool's embedded URL elicitation request.
const BROWSER_FLOW = "browserFlow";

/**
 * Registers the 'trigger-url-elicitation' tool.
 *
 * Sends a URL-mode elicitation asking the user to open a link, then reports
 * whether they completed, declined, or cancelled the flow.
 *
 * The request is made in the **multi-round-trip** style: the handler returns
 * `inputRequired({ inputRequests: { …: inputRequired.elicitUrl(…) } })`. On
 * 2026-07-28 URL elicitation rides the MRTR flow natively. On a legacy-era
 * connection the SDK's legacy shim issues a real `elicitation/create` with a
 * synthesized `elicitationId` (the 2025-11-25 wire requires one; the 2026
 * in-band shape has none) and re-enters this handler with the response.
 *
 * ## What was removed, and why
 *
 * The v1 version of this tool also demonstrated an **error path**: throwing
 * `UrlElicitationRequiredError` to produce a `-32042` protocol error carrying a
 * prerequisite elicitation, plus a module-level `Set` keyed on session id that
 * suppressed a re-throw when the client retried. Both are gone:
 *
 * - `-32042` is legacy-era only. On a 2026-07-28 request the SDK refuses the
 *   throw outright and steers to `inputRequired.elicitUrl(...)` rather than
 *   converting it silently, so the error path cannot be written era-agnostically.
 * - The retry-suppression `Set` was keyed on `sessionId`, and 2026-07-28 has no
 *   sessions. The modern equivalent is `requestState` -- opaque server-minted
 *   state echoed back on the retry -- which the MRTR flow below gets for free
 *   from the SDK's round tracking, with no hand-rolled dedupe needed.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerUrlElicitationTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (args, ctx): Promise<CallToolResult | InputRequiredResult> => {
      const { url, message, elicitationId: requestedElicitationId } = args;
      const elicitationId = requestedElicitationId ?? randomUUID();

      const answer = inputResponse(ctx.mcpReq.inputResponses, BROWSER_FLOW);

      // First round: ask the client to take the user through the browser flow.
      if (answer.kind === "missing") {
        return inputRequired({
          inputRequests: {
            [BROWSER_FLOW]: inputRequired.elicitUrl({ url, message }),
          },
        });
      }

      // Re-entry: the client reports how the flow ended.
      const content: CallToolResult["content"] = [];

      if (answer.kind === "elicit" && answer.action === "accept") {
        content.push({
          type: "text",
          text:
            `✅ User completed the URL elicitation flow.\n` +
            `Elicitation ID: ${elicitationId}\n` +
            `URL: ${url}`,
        });
      } else if (answer.kind === "elicit" && answer.action === "decline") {
        content.push({
          type: "text",
          text: `❌ User declined to open the URL (Elicitation ID: ${elicitationId}).`,
        });
      } else if (answer.kind === "elicit" && answer.action === "cancel") {
        content.push({
          type: "text",
          text: `⚠️ User cancelled the URL elicitation (Elicitation ID: ${elicitationId}).`,
        });
      }

      // Include raw result for debugging
      content.push({
        type: "text",
        text: `\nRaw result: ${JSON.stringify(answer, null, 2)}`,
      });

      return { content };
    }
  );
};
