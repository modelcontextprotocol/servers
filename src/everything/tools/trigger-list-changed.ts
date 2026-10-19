// The `trigger-list-changed` tool: announces that the server's tool, prompt
// or resource list changed, so a client can watch the notification arrive.
//
// Where the notification goes depends on the protocol era (#4852). A
// 2025-era client gets it unsolicited. A 2026-07-28 client gets it only on a
// `subscriptions/listen` stream whose filter asked for that list
// (`toolsListChanged`, `promptsListChanged` or `resourcesListChanged`). The
// server context's publisher picks the route: the instance itself on stdio
// and on a 2025-era session, the handler's subscription bus on the 2026-07-28
// HTTP path.

import { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ServerContext } from "../server/context.js";

// Tool input schema
const TriggerListChangedSchema = z.object({
  list: z
    .enum(["tools", "prompts", "resources"])
    .describe("Which list to announce as changed"),
});

// Tool configuration
const name = "trigger-list-changed";
const config = {
  title: "Trigger List Changed Tool",
  description:
    "Sends a notifications/<list>/list_changed for the tool, prompt or resource list. On protocol version " +
    "2026-07-28 it is delivered on each subscriptions/listen stream that asked for that list; a 2025-era " +
    "client receives it unsolicited.",
  inputSchema: TriggerListChangedSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

/**
 * Registers the 'trigger-list-changed' tool.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @param {ServerContext} context - Where the instance's change notifications go.
 */
export const registerTriggerListChangedTool = (
  server: McpServer,
  context: ServerContext,
) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const { list } = TriggerListChangedSchema.parse(args);
    if (list === "tools") context.publish.toolsChanged();
    else if (list === "prompts") context.publish.promptsChanged();
    else context.publish.resourcesChanged();
    return {
      content: [
        {
          type: "text",
          text: `Sent notifications/${list}/list_changed`,
        },
      ],
    };
  });
};
