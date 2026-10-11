// The `toggle-simulated-logging` tool: starts or stops a timer that sends the
// client a random-leveled log message every five seconds, filtered by the
// level it set with `logging/setLevel`.
//
// 2025-era only, and deprecated: the 2026-07-28 revision removes
// `logging/setLevel` and unsolicited log messages (and deprecates logging),
// so the server factory registers this tool only for a 2025-era client.
// `trigger-log-messages` shows the 2026-07-28 replacement, a log level set
// per request. The timer belongs to the server instance serving this client,
// so no session map is needed (#4852).

import { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import { beginSimulatedLogging } from "../server/logging.js";
import type { ServerContext } from "../server/context.js";

// Tool configuration
const name = "toggle-simulated-logging";
const config = {
  title: "Toggle Simulated Logging",
  description:
    "Toggles simulated, random-leveled logging on or off. Deprecated: 2025-era clients only, since " +
    "protocol version 2026-07-28 removes logging/setLevel; use trigger-log-messages with a per-request " +
    "log level instead.",
  inputSchema: {},
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

/**
 * Registers the `toggle-simulated-logging` tool.
 *
 * The registered tool enables or disables the sending of periodic, random-leveled
 * logging messages to the connected client. Each call flips the state: it
 * starts the messages when they are off and stops them when they are on. The
 * messages also stop when the connection ends.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @param {ServerContext} context - The instance's cleanup registry.
 */
export const registerToggleSimulatedLoggingTool = (
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
      response = "Stopped simulated logging";
    } else {
      stop = beginSimulatedLogging(server);
      response =
        "Started simulated, random-leveled logging at a 5 second pace. Client's selected logging level will be respected. If an interval elapses and the message to be sent is below the selected level, it will not be sent. Thus at higher chosen logging levels, messages should arrive further apart.";
    }

    return {
      content: [{ type: "text", text: response }],
    };
  });
};
