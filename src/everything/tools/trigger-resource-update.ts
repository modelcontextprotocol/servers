// The `trigger-resource-update` tool: announces that a resource changed, so a
// client can watch `notifications/resources/updated` arrive for a resource it
// asked to be told about.
//
// How the client asks depends on the protocol era (#4852). A 2026-07-28
// client names the URI in the `resourceSubscriptions` of its
// `subscriptions/listen` filter, and the notification is delivered only on
// such a stream. A 2025-era client calls `resources/subscribe`, and the
// notification is sent only once it has. This replaces the timed updates of
// `toggle-subscriber-updates` (2025-era only) with one sent on demand.

import { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ServerContext } from "../server/context.js";

// Tool input schema
const TriggerResourceUpdateSchema = z.object({
  uri: z
    .string()
    .describe(
      "The URI of the resource to announce as updated, e.g. demo://resource/dynamic/text/1",
    ),
});

// Tool configuration
const name = "trigger-resource-update";
const config = {
  title: "Trigger Resource Update Tool",
  description:
    "Sends a notifications/resources/updated for a resource URI. On protocol version 2026-07-28 it is " +
    "delivered on each subscriptions/listen stream whose resourceSubscriptions name the URI; a 2025-era " +
    "client receives it once it has called resources/subscribe for the URI.",
  inputSchema: TriggerResourceUpdateSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

/**
 * Registers the 'trigger-resource-update' tool.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @param {ServerContext} context - Where the instance's change notifications go.
 */
export const registerTriggerResourceUpdateTool = (
  server: McpServer,
  context: ServerContext,
) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const { uri } = TriggerResourceUpdateSchema.parse(args);
    context.publish.resourceUpdated(uri);
    return {
      content: [
        {
          type: "text",
          text: `Sent notifications/resources/updated for ${uri} to each subscriber`,
        },
      ],
    };
  });
};
