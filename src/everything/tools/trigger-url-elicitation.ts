// The `trigger-url-elicitation` tool: directs the user to a URL in the
// browser (URL-mode elicitation) and reports how the flow ended.
//
// The two protocol eras do this differently, so the tool branches on the era
// its server instance serves (#4852):
// - 2025-era: the server sends an `elicitation/create` request carrying an
//   `elicitationId` (the request path), or throws a
//   `UrlElicitationRequiredError` (-32042) that the client handles before it
//   retries (the error path).
// - 2026-07-28: there is no server-to-client request and no -32042 error. The
//   tool returns `input_required` carrying the URL elicitation, and the client
//   retries with the user's answer. The in-band request has no
//   `elicitationId`, and `errorPath` changes nothing.

import { randomUUID } from "node:crypto";
import {
  McpServer,
  CallToolResult,
  ElicitRequestURLParams,
  inputRequired,
  inputResponse,
  UrlElicitationRequiredError,
  type InputRequiredResult,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ServerContext } from "../server/context.js";

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
      "Optional explicit elicitation ID. Defaults to a random UUID. 2025-era clients only: the " +
        "2026-07-28 in-band request carries no elicitation ID.",
    ),
  errorPath: z
    .boolean()
    .default(false)
    .describe(
      "Controls which elicitation mechanism is used. " +
        "When false (default), sends an elicitation/create request (request path). " +
        "When true, throws a UrlElicitationRequiredError (MCP error code -32042) so the client handles " +
        "the URL elicitation via the error path rather than waiting for a response. " +
        "To clear the error, satisfy the prerequisite and retry this call with the same arguments; the " +
        "retry ignores errorPath and proceeds, so the client does not loop on the same error. " +
        "2025-era clients only: protocol version 2026-07-28 has no -32042 error, so there both " +
        "settings use the in-band input_required flow.",
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
    "to handle URL elicitation via the error response. Set errorPath=true to use the error path. " +
    "On protocol version 2026-07-28 the server instead returns the URL elicitation in-band (input_required).",
  inputSchema: TriggerUrlElicitationSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

/**
 * Registers the 'trigger-url-elicitation' tool.
 *
 * The tool needs a client that supports URL-mode elicitation: on a 2025-era
 * connection the server factory registers it only for a client that declared
 * `elicitation.url`, and on 2026-07-28 the SDK refuses the embedded request
 * (-32021) of a client whose request did not declare it.
 *
 * On 2026-07-28 it returns the URL elicitation in-band and reports the answer
 * on the retry. On a 2025-era connection, depending on the `errorPath`
 * argument, it either:
 *  - Sends an `elicitation/create` request and awaits the result (request path), or
 *  - Throws a `UrlElicitationRequiredError` (MCP error -32042) carrying a
 *    prerequisite elicitation for the client to handle (error path). When the
 *    client satisfies the prerequisite and retries the same call, the retry
 *    ignores `errorPath` and proceeds via the request path, so the client does
 *    not loop on the same error.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @param {ServerContext} context - The protocol era the instance serves.
 */
export const registerTriggerUrlElicitationTool = (
  server: McpServer,
  context: ServerContext,
) => {
  if (context.era === "modern") {
    server.registerTool(
      name,
      config,
      async (args, ctx): Promise<CallToolResult | InputRequiredResult> => {
        const { url, message } = args;
        const answer = inputResponse(ctx.mcpReq.inputResponses, "url");

        // First round: direct the user to the URL
        if (answer.kind !== "elicit") {
          return inputRequired({
            inputRequests: { url: inputRequired.elicitUrl({ message, url }) },
          });
        }

        const text =
          answer.action === "accept"
            ? `✅ User completed the URL elicitation flow.\nURL: ${url}`
            : answer.action === "decline"
              ? "❌ User declined to open the URL."
              : "⚠️ User cancelled the URL elicitation.";
        return {
          content: [
            { type: "text", text },
            {
              type: "text",
              text: `\nRaw result: ${JSON.stringify({ action: answer.action }, null, 2)}`,
            },
          ],
        };
      },
    );
    return;
  }

  /**
   * Requests for which an error-path prerequisite has already been issued on
   * this connection, keyed by the stable inputs a client resends when it
   * retries the original tool call (URL + caller-supplied elicitationId).
   *
   * When the client satisfies the prerequisite and retries the same call, the
   * matching entry lets us recognize the retry, ignore `errorPath`, and
   * proceed via the request path instead of re-throwing
   * `UrlElicitationRequiredError` — which would otherwise loop forever (throw
   * -> client satisfies prerequisite -> retry -> throw -> ...).
   *
   * The set belongs to this server instance, which serves one connection or
   * session, so it goes away with it (#4852). Entries are removed on a
   * recognized retry; a client that never retries leaves its key until it
   * disconnects.
   */
  const issuedErrorPathElicitations = new Set<string>();

  server.registerTool(
    name,
    config,
    async (args, ctx): Promise<CallToolResult> => {
      const {
        url,
        message,
        elicitationId: requestedElicitationId,
        errorPath,
      } = args;

      const elicitationId = requestedElicitationId ?? randomUUID();

      // Key the one-shot error-path marker on inputs the client resends
      // verbatim when it retries the original tool call. A real client retries
      // with the *same* arguments and does NOT echo the prerequisite's
      // (server-generated) elicitationId, so we must key on stable inputs:
      // the requested URL and the caller-supplied elicitationId (if any).
      // Keying on the resolved/random elicitationId would change on every
      // call and never match, re-throwing the prerequisite forever.
      const errorPathKey = `${url}\u0000${requestedElicitationId ?? ""}`;

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
            "This request requires browser-based authorization.",
          );
        }
      }

      // Request path: send elicitation/create and await the user's response
      const elicitationResult = await ctx.mcpReq.send(
        {
          method: "elicitation/create",
          params: elicitationParams,
        },
        { timeout: 10 * 60 * 1000 /* 10 minutes */ },
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
    },
  );
};
