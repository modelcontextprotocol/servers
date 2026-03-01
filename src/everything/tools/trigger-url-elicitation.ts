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
        "the URL elicitation via the error path rather than waiting for a response."
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
};

/**
 * Registers the 'trigger-url-elicitation' tool.
 *
 * This tool only registers when the client advertises URL-mode elicitation
 * capability (clientCapabilities.elicitation.url).
 *
 * Depending on the `errorPath` argument it either:
 *  - Sends an `elicitation/create` request and awaits the result (request path), or
 *  - Throws a `UrlElicitationRequiredError` (MCP error -32042) for the client to
 *    handle via the error path.
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
        const validatedArgs = TriggerUrlElicitationSchema.parse(args);
        const {
          url,
          message,
          elicitationId: requestedElicitationId,
          errorPath,
        } = validatedArgs;

        const elicitationId = requestedElicitationId ?? randomUUID();

        const elicitationParams: ElicitRequestURLParams = {
          mode: "url",
          url,
          message,
          elicitationId,
        };

        // Error path: throw UrlElicitationRequiredError (-32042) for the client to handle
        if (errorPath) {
          throw new UrlElicitationRequiredError(
            [elicitationParams],
            "This request requires browser-based authorization."
          );
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

        const content: CallToolResult["content"] = [
          {
            type: "text",
            text:
              `URL elicitation action: ${elicitationResult.action}\n` +
              `Elicitation ID: ${elicitationId}\n` +
              `URL: ${url}`,
          },
        ];

        content.push({
          type: "text",
          text: `Raw result: ${JSON.stringify(elicitationResult, null, 2)}`,
        });

        return { content };
      }
    );
  }
};
