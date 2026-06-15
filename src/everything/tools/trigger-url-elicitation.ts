import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ElicitRequestURLParams,
  ElicitResultSchema,
  UrlElicitationRequiredError,
} from "@modelcontextprotocol/sdk/types.js";
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
    .describe("Optional explicit elicitation ID. Defaults to a random UUID."),
  errorPath: z
    .boolean()
    .default(false)
    .describe(
      "Controls which elicitation mechanism is used. " +
        "When false (default), sends an elicitation/create request (request path). " +
        "When true, throws a UrlElicitationRequiredError (MCP error code -32042) so the client handles " +
        "the URL elicitation via the error path rather than waiting for a response. " +
        "To clear the error, satisfy the prerequisite and retry this call with the same arguments; the " +
        "retry ignores errorPath and proceeds, so the client does not loop on the same error."
    ),
});

// Tool configuration
const name = "trigger-url-elicitation";
const config = {
  title: "Trigger URL Elicitation Tool",
  description:
    "Trigger a URL elicitation so the client can direct the user to a browser flow. " +
    "Supports two mechanisms: the request path (elicitation/create, default) which awaits the user's " +
    "response, and the error path (UrlElicitationRequiredError, -32042) which signals the client " +
    "to handle URL elicitation via the error response. Set errorPath=true to use the error path.",
  inputSchema: TriggerUrlElicitationSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

/**
 * Tracks requests for which an error-path prerequisite has already been issued,
 * keyed by the stable inputs a client resends when it retries the original tool
 * call (session + URL + caller-supplied elicitationId).
 *
 * When the client satisfies the prerequisite and retries the same call, the
 * matching entry lets us recognize the retry, ignore `errorPath`, and proceed
 * via the request path instead of re-throwing `UrlElicitationRequiredError` —
 * which would otherwise loop forever (throw -> client satisfies prerequisite ->
 * retry -> throw -> ...).
 *
 * Demo simplification: entries are only removed on a recognized retry, so a
 * client that triggers the error path and never retries leaves its key behind.
 * That is acceptable for this reference server; a production implementation
 * serving many long-lived sessions should evict entries (e.g. a
 * `Map<string, timestamp>` with TTL-based cleanup).
 */
const issuedErrorPathElicitations = new Set<string>();

/**
 * Test-only helper to reset the module-level error-path state between cases.
 * Not part of the tool's public behavior.
 */
export const __resetIssuedErrorPathElicitations = () =>
  issuedErrorPathElicitations.clear();

/**
 * Registers the 'trigger-url-elicitation' tool.
 *
 * This tool only registers when the client advertises URL-mode elicitation
 * capability (clientCapabilities.elicitation.url).
 *
 * Depending on the `errorPath` argument it either:
 *  - Sends an `elicitation/create` request and awaits the result (request path), or
 *  - Throws a `UrlElicitationRequiredError` (MCP error -32042) carrying a
 *    prerequisite elicitation for the client to handle (error path). When the
 *    client satisfies the prerequisite and retries the same call, the retry
 *    ignores `errorPath` and proceeds via the request path, so the client does
 *    not loop on the same error.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerUrlElicitationTool = (server: McpServer) => {
  const clientCapabilities = server.server.getClientCapabilities() || {};
  const clientElicitationCapabilities = clientCapabilities.elicitation as
    | {
        url?: object;
      }
    | undefined;

  const clientSupportsUrlElicitation =
    clientElicitationCapabilities?.url !== undefined;

  if (clientSupportsUrlElicitation) {
    server.registerTool(
      name,
      config,
      async (args, extra): Promise<CallToolResult> => {
        const {
          url,
          message,
          elicitationId: requestedElicitationId,
          errorPath,
        } = args;

        const elicitationId = requestedElicitationId ?? randomUUID();
        const sessionId = extra.sessionId ?? "default";

        // Key the one-shot error-path marker on inputs the client resends
        // verbatim when it retries the original tool call. A real client retries
        // with the *same* arguments and does NOT echo the prerequisite's
        // (server-generated) elicitationId, so we must key on stable inputs:
        // the session, the requested URL, and the caller-supplied elicitationId
        // (if any). Keying on the resolved/random elicitationId would change on
        // every call and never match, re-throwing the prerequisite forever.
        const errorPathKey = `${sessionId}\u0000${url}\u0000${requestedElicitationId ?? ""}`;

        const elicitationParams: ElicitRequestURLParams = {
          mode: "url",
          url,
          message,
          elicitationId,
        };

        // Error path: signal the client via UrlElicitationRequiredError (-32042)
        // so it handles a prerequisite URL elicitation before this request can
        // proceed. Two things keep the client from looping forever:
        //
        //  1. The prerequisite points at a *different* URL than the one that
        //     failed. Reusing the original `url` would make the client complete
        //     the prerequisite, retry, and hit the same -32042 error endlessly.
        //  2. We remember that we issued a prerequisite for this request. When
        //     the client satisfies it and retries the same call, we recognize
        //     the retry, *ignore* errorPath, and fall through to the request
        //     path. Without this, the retry would re-enter the error path and
        //     re-request the prerequisite URL — another loop.
        if (errorPath) {
          if (issuedErrorPathElicitations.has(errorPathKey)) {
            // Retry of a satisfied prerequisite: clear the one-shot marker and
            // ignore errorPath, falling through to the request path below.
            issuedErrorPathElicitations.delete(errorPathKey);
          } else {
            // Originating call: record that we issued a prerequisite for this
            // request, then signal the client via -32042.
            issuedErrorPathElicitations.add(errorPathKey);
            const prerequisiteElicitation: ElicitRequestURLParams = {
              mode: "url",
              url: "https://modelcontextprotocol.io",
              message:
                "Open this link to satisfy the prerequisite, then retry the request.",
              elicitationId: randomUUID(),
            };
            throw new UrlElicitationRequiredError(
              [prerequisiteElicitation],
              "This request requires browser-based authorization."
            );
          }
        }

        // Request path: send elicitation/create and await the user's response
        const elicitationResult = await extra.sendRequest(
          {
            method: "elicitation/create",
            params: elicitationParams,
          },
          ElicitResultSchema,
          { timeout: 10 * 60 * 1000 /* 10 minutes */ }
        );

        // Handle different response actions
        const content: CallToolResult["content"] = [];

        if (elicitationResult.action === "accept") {
          content.push({
            type: "text",
            text:
              `✅ User completed the URL elicitation flow.\n` +
              `Elicitation ID: ${elicitationId}\n` +
              `URL: ${url}`,
          });
        } else if (elicitationResult.action === "decline") {
          content.push({
            type: "text",
            text: `❌ User declined to open the URL (Elicitation ID: ${elicitationId}).`,
          });
        } else if (elicitationResult.action === "cancel") {
          content.push({
            type: "text",
            text: `⚠️ User cancelled the URL elicitation (Elicitation ID: ${elicitationId}).`,
          });
        }

        // Include raw result for debugging
        content.push({
          type: "text",
          text: `\nRaw result: ${JSON.stringify(elicitationResult, null, 2)}`,
        });

        return { content };
      }
    );
  }
};
