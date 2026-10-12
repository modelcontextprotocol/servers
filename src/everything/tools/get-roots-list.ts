// The `get-roots-list` tool: asks the client for its roots and lists them.
//
// Written once for both protocol eras with a multi-round-trip request
// (#4852): the first call returns `input_required` carrying a `roots/list`
// request, the client answers it and retries, and the retry lists the
// answer. A 2026-07-28 client does that in-band; for a 2025-era client the
// SDK's legacy shim sends a real `roots/list` request and re-enters the
// handler with the answer. Roots is deprecated as of 2026-07-28 (SEP-2577).

import {
  McpServer,
  CallToolResult,
  inputRequired,
  inputResponse,
  type InputRequiredResult,
} from "@modelcontextprotocol/server";

// Tool configuration
const name = "get-roots-list";
const config = {
  title: "Get Roots List Tool",
  description:
    "Lists the current MCP roots provided by the client. Demonstrates the roots protocol capability even though this server doesn't access files. " +
    "Deprecated: Roots is deprecated as of protocol version 2026-07-28. The server asks for the roots with a multi-round-trip request on every protocol version.",
  inputSchema: {},
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Registers the 'get-roots-list' tool.
 *
 * The tool needs a client that supports Roots: on a 2025-era connection the
 * server factory registers it only for one that declared the capability, and
 * on 2026-07-28 the SDK refuses the embedded request (-32021) of a client
 * whose request did not declare it.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetRootsListTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (_args, ctx): Promise<CallToolResult | InputRequiredResult> => {
      const answer = inputResponse(ctx.mcpReq.inputResponses, "roots");

      // First round: ask the client for its roots
      if (answer.kind !== "roots") {
        return inputRequired({
          inputRequests: { roots: inputRequired.listRoots() },
        });
      }

      const currentRoots = answer.roots;

      // Respond if client supports roots but doesn't have any configured
      if (currentRoots.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                "The client supports roots but no roots are currently configured.\n\n" +
                "This could mean:\n" +
                "1. The client hasn't provided any roots yet\n" +
                "2. The client provided an empty roots list\n" +
                "3. The roots configuration is still being loaded",
            },
          ],
        };
      }

      // Create formatted response if there is a list of roots
      const rootsList = currentRoots
        .map((root, index) => {
          return `${index + 1}. ${root.name || "Unnamed Root"}\n   URI: ${
            root.uri
          }`;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text:
              `Current MCP Roots (${currentRoots.length} total):\n\n${rootsList}\n\n` +
              "Note: This server demonstrates the roots protocol capability but doesn't actually access files. " +
              "The roots are provided by the MCP client and can be used by servers that need file system access.",
          },
        ],
      };
    },
  );
};
