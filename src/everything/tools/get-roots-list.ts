import {
  McpServer,
  CallToolResult,
  InputRequiredResult,
  Root,
  inputRequired,
  inputResponse,
} from "@modelcontextprotocol/server";
import { roots as cachedRoots } from "../server/roots.js";

// Tool configuration
const name = "get-roots-list";
const config = {
  title: "Get Roots List Tool",
  description:
    "Lists the current MCP roots provided by the client. Demonstrates the roots protocol capability even though this server doesn't access files.",
  inputSchema: {},
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

// Key for this tool's embedded roots request.
const ROOTS = "roots";

/**
 * Registers the 'get-roots-list' tool.
 *
 * Reports the roots the client has made available -- workspace directories or
 * file system roots. This server demonstrates the capability without actually
 * reading any files.
 *
 * Roots are obtained differently on each era, and this tool handles both
 * without branching:
 *
 * - On a **legacy-era** connection the server pulls `roots/list` after the
 *   handshake and caches the answer per session (see `server/roots.ts`), so the
 *   list is usually already known by the time this tool runs and it answers
 *   immediately from cache.
 * - On **2026-07-28** there is no server->client request channel and no
 *   session to cache against, so nothing is prefetched. The tool asks for the
 *   roots by returning `inputRequired({ inputRequests: { roots:
 *   inputRequired.listRoots() } })` and the client retries the call with the
 *   listing attached.
 *
 * The cache lookup simply misses on the modern era, which falls through to the
 * request -- the same code path serves both.
 *
 * Registration is unconditional. A client that never declared the `roots`
 * capability is refused by the SDK at dispatch with `-32021`, on both eras.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetRootsListTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (args, ctx): Promise<CallToolResult | InputRequiredResult> => {
      const answer = inputResponse(ctx.mcpReq.inputResponses, ROOTS);

      // Prefer a listing the client just sent; otherwise fall back to whatever
      // the legacy-era post-handshake sync cached for this session.
      let currentRoots: Root[] | undefined;
      if (answer.kind === "roots") {
        currentRoots = answer.roots;
      } else if (answer.kind === "missing") {
        currentRoots = cachedRoots.get(ctx.sessionId);

        // Nothing cached (always the case on 2026-07-28): ask for it.
        if (!currentRoots) {
          return inputRequired({
            inputRequests: { [ROOTS]: inputRequired.listRoots() },
          });
        }
      }

      // Respond if the client supports roots but doesn't have any configured
      if (!currentRoots || currentRoots.length === 0) {
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
    }
  );
};
