import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ElicitRequestURLParams,
  ElicitResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Tool input schema
const TriggerUrlElicitationRequestSchema = z.object({
  url: z.string().url().describe("The URL the user should open"),
  message: z
    .string()
    .default("Please open the link to complete this action.")
    .describe("Message shown to the user before opening the URL"),
  elicitationId: z
    .string()
    .optional()
    .describe("Optional explicit elicitation ID. Defaults to a random UUID."),
  sendCompletionNotification: z
    .boolean()
    .default(false)
    .describe(
      "If true, sends notifications/elicitation/complete after an accepted URL elicitation."
    ),
});

// Tool configuration
const name = "trigger-url-elicitation-request";
const config = {
  title: "Trigger URL Elicitation Request Tool",
  description:
    "Trigger an out-of-band URL elicitation request so the client can direct the user to a browser flow.",
  inputSchema: TriggerUrlElicitationRequestSchema,
};

/**
 * Registers the 'trigger-url-elicitation-request' tool.
 *
 * This tool only registers when the client advertises URL-mode elicitation
 * capability (clientCapabilities.elicitation.url).
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerUrlElicitationRequestTool = (server: McpServer) => {
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
        const validatedArgs = TriggerUrlElicitationRequestSchema.parse(args);
        const {
          url,
          message,
          elicitationId: requestedElicitationId,
          sendCompletionNotification,
        } = validatedArgs;

        const elicitationId = requestedElicitationId ?? randomUUID();

        const params: ElicitRequestURLParams = {
          mode: "url",
          message,
          url,
          elicitationId,
        };

        const elicitationResult = await extra.sendRequest(
          {
            method: "elicitation/create",
            params,
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

        if (
          sendCompletionNotification &&
          elicitationResult.action === "accept"
        ) {
          const notifyElicitationComplete =
            server.server.createElicitationCompletionNotifier(elicitationId);
          await notifyElicitationComplete();
          content.push({
            type: "text",
            text: `Sent notifications/elicitation/complete for ${elicitationId}.`,
          });
        }

        content.push({
          type: "text",
          text: `Raw result: ${JSON.stringify(elicitationResult, null, 2)}`,
        });

        return { content };
      }
    );
  }
};

