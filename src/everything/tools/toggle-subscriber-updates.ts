// The `toggle-subscriber-updates` tool: starts or stops a timer that sends
// `notifications/resources/updated` for each resource the client subscribed
// to with `resources/subscribe`.
//
// 2025-era only, and deprecated: the 2026-07-28 revision removes
// `resources/subscribe` and unsolicited notifications, so the server factory
// registers this tool only for a 2025-era client. A 2026-07-28 client asks
// for updates in its `subscriptions/listen` filter, and
// `trigger-resource-update` sends one on demand. The timer belongs to the
// server instance serving this client, so no session map is needed (#4852).

import { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import { beginSimulatedResourceUpdates } from "../resources/subscriptions.js";
import type { ServerContext } from "../server/context.js";

// Tool configuration
const name = "toggle-subscriber-updates";
const config = {
  title: "Toggle Subscriber Updates",
  description:
    "Toggles simulated resource subscription updates on or off. Deprecated: 2025-era clients only, " +
    "since protocol version 2026-07-28 removes resources/subscribe; use trigger-resource-update with a " +
    "subscriptions/listen stream instead.",
  inputSchema: {},
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

/**
 * Registers the `toggle-subscriber-updates` tool.
 *
 * The registered tool enables or disables the sending of periodic, simulated resource
 * update messages to the connected client for any subscriptions it has made.
 * Each call flips the state: it starts the updates when they are off and stops
 * them when they are on. The updates also stop when the connection ends.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @param {ServerContext} context - The instance's subscriptions and cleanup registry.
 */
export const registerToggleSubscriberUpdatesTool = (
  server: McpServer,
  context: ServerContext,
) => {
  let stop: (() => void) | undefined;
  context.onCleanup(() => {
    stop?.();
    stop = undefined;
  });

  server.registerTool(name, config, async (): Promise<CallToolResult> => {
    let response: string;
    if (stop) {
      stop();
      stop = undefined;
      response = "Stopped simulated resource updates";
    } else {
      stop = beginSimulatedResourceUpdates(server, context.subscribed);
      response =
        "Started simulated resource updated notifications at a 5 second pace. Client will receive updates for any resources it is subscribed to.";
    }

    return {
      content: [{ type: "text", text: response }],
    };
  });
};
