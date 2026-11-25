// The `trigger-event` tool: raises the Events extension's `custom-event` on
// every open push stream subscribed to it (#5651), so a client can watch an
// event arrive on `events/stream` when it asks for one.
//
// Besides an ordinary event, it can make the streams report a recoverable
// upstream failure (`notifications/events/error`, the stream stays open) or
// end their subscriptions (`notifications/events/terminated`), the two
// non-event outcomes a push subscriber has to handle. The extension is served
// on 2026-07-28 only, so the tool is too.

import { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { emitCustomEvent } from "../server/events.js";
import { TOOL_ICONS } from "../server/icons.js";

// Tool input schema
const TriggerEventSchema = z.object({
  kind: z
    .enum(["event", "error", "terminate"])
    .default("event")
    .describe(
      "event: deliver a custom-event occurrence; error: send notifications/events/error and keep the " +
        "streams open; terminate: send notifications/events/terminated and close the streams",
    ),
  message: z
    .string()
    .min(1)
    .max(500)
    .default("Hello from trigger-event")
    .describe(
      "The event's message, or the reason given for an error or termination",
    ),
  severity: z
    .enum(["info", "warning", "error"])
    .default("info")
    .describe(
      "The event's severity, matched against each stream's minSeverity (kind event only)",
    ),
});

// Tool configuration
const name = "trigger-event";
const config = {
  title: "Trigger Event Tool",
  description:
    "Raises the Events extension's custom-event on every open events/stream subscribed to it. " +
    "With kind error it sends a recoverable notifications/events/error instead, and with kind " +
    "terminate it ends those subscriptions with notifications/events/terminated.",
  inputSchema: TriggerEventSchema,
  icons: TOOL_ICONS,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

/**
 * Registers the 'trigger-event' tool.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerEventTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const { kind, message, severity } = TriggerEventSchema.parse(args);
    const streams = emitCustomEvent(
      kind === "event" ? { kind, message, severity } : { kind, message },
    );
    const what =
      kind === "event"
        ? `custom-event (${severity})`
        : kind === "error"
          ? "notifications/events/error"
          : "notifications/events/terminated";
    return {
      content: [
        {
          type: "text",
          text: `Sent ${what} to ${streams} open custom-event stream${streams === 1 ? "" : "s"}`,
        },
      ],
    };
  });
};
