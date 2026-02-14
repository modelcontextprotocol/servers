import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  ElicitRequestURLParams,
  UrlElicitationRequiredError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Tool input schema
const TriggerUrlElicitationRequiredErrorSchema = z.object({
  url: z.string().url().describe("The URL the user should open"),
  message: z
    .string()
    .default("This request requires more information.")
    .describe("Message shown to the user for the URL elicitation"),
  elicitationId: z
    .string()
    .optional()
    .describe("Optional explicit elicitation ID. Defaults to a random UUID."),
});

// Tool configuration
const name = "trigger-url-elicitation-required-error";
const config = {
  title: "Trigger URL Elicitation Required Error Tool",
  description:
    "Returns MCP error -32042 (URL elicitation required) so clients can handle URL-mode elicitations via the error path.",
  inputSchema: TriggerUrlElicitationRequiredErrorSchema,
};

/**
 * Registers the 'trigger-url-elicitation-required-error' tool.
 *
 * This tool demonstrates the MCP error path for URL elicitation by throwing
 * UrlElicitationRequiredError (code -32042) from a tool handler.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerUrlElicitationRequiredErrorTool = (
  server: McpServer
) => {
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
      async (args): Promise<CallToolResult> => {
        const validatedArgs = TriggerUrlElicitationRequiredErrorSchema.parse(args);
        const { url, message, elicitationId: requestedElicitationId } =
          validatedArgs;

        const elicitationId = requestedElicitationId ?? randomUUID();

        const requiredElicitation: ElicitRequestURLParams = {
          mode: "url",
          url,
          message,
          elicitationId,
        };

        throw new UrlElicitationRequiredError(
          [requiredElicitation],
          "This request requires more information."
        );
      }
    );
  }
};

