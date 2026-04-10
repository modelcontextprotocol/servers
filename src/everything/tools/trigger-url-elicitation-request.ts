import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ElicitResultSchema,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

// Tool configuration
const name = "trigger-url-elicitation-request";
const config = {
  title: "Trigger URL Elicitation Request Tool",
  description:
    "Trigger a URL elicitation request (SEP-1036) that asks the client to " +
    "navigate the user to an external URL for out-of-band interaction, such " +
    "as OAuth authorization or payment flows.",
  inputSchema: {},
};

/**
 * Registers the 'trigger-url-elicitation-request' tool.
 *
 * This tool demonstrates SEP-1036 URL Elicitation, where the server requests
 * the client to open an external URL for the user. This is used for flows
 * where sensitive data (credentials, payment info) must not transit through
 * the MCP client, such as third-party OAuth authorization.
 *
 * The client responds with accept (user consented to navigate), decline,
 * or cancel. The actual interaction happens out-of-band in the browser.
 *
 * Requires the client to declare `elicitation.url` capability.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerUrlElicitationRequestTool = (
  server: McpServer
) => {
  const clientCapabilities = server.server.getClientCapabilities() || {};
  const elicitationCapability = clientCapabilities.elicitation as
    | { url?: object }
    | undefined;
  const clientSupportsUrlElicitation = elicitationCapability?.url !== undefined;

  if (clientSupportsUrlElicitation) {
    server.registerTool(
      name,
      config,
      async (args, extra): Promise<CallToolResult> => {
        const elicitationId = crypto.randomUUID();
        const elicitationResult = await extra.sendRequest(
          {
            method: "elicitation/create",
            params: {
              mode: "url",
              elicitationId,
              message:
                "Please authorize access to your GitHub repositories. " +
                "You will be redirected to GitHub to complete the authorization.",
              url: "https://github.com/login/oauth/authorize?client_id=EXAMPLE_CLIENT_ID&scope=repo&state=example-state",
            },
          },
          ElicitResultSchema,
          { timeout: 10 * 60 * 1000 /* 10 minutes */ }
        );

        const content: CallToolResult["content"] = [];

        if (elicitationResult.action === "accept") {
          content.push({
            type: "text",
            text: "✅ User accepted the URL elicitation request and was directed to the external URL.",
          });
        } else if (elicitationResult.action === "decline") {
          content.push({
            type: "text",
            text: "❌ User declined to navigate to the external URL.",
          });
        } else if (elicitationResult.action === "cancel") {
          content.push({
            type: "text",
            text: "⚠️ User cancelled the URL elicitation dialog.",
          });
        }

        content.push({
          type: "text",
          text: `\nRaw result: ${JSON.stringify(elicitationResult, null, 2)}`,
        });

        return { content };
      }
    );
  }
};
