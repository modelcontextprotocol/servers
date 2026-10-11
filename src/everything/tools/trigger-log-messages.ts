// The `trigger-log-messages` tool: sends one log message at each logging
// level during the call, so a client can see which ones its level lets
// through.
//
// The level is set differently on each protocol era (#4852). A 2026-07-28
// client names it per request, in the request's `_meta`
// (`io.modelcontextprotocol/logLevel`), and a request that names none gets no
// log messages at all. A 2025-era client sets it for the whole session with
// `logging/setLevel`. The SDK applies whichever filter the request has, so
// the handler is the same for both. Logging is deprecated as of 2026-07-28
// (SEP-2577); this replaces `toggle-simulated-logging`, whose timer relies on
// `logging/setLevel` and unsolicited messages, which 2026-07-28 removes.

import {
  McpServer,
  CallToolResult,
  LoggingLevel,
} from "@modelcontextprotocol/server";

/** Every logging level, from least to most severe. */
export const LOGGING_LEVELS: LoggingLevel[] = [
  "debug",
  "info",
  "notice",
  "warning",
  "error",
  "critical",
  "alert",
  "emergency",
];

// Tool configuration
const name = "trigger-log-messages";
const config = {
  title: "Trigger Log Messages Tool",
  description:
    "Sends one log message at each logging level during the call. On protocol version 2026-07-28 only " +
    "the messages at or above the level the request names in _meta (io.modelcontextprotocol/logLevel) " +
    "are sent, and none if it names no level; a 2025-era client gets those at or above the level it set " +
    "with logging/setLevel. Deprecated: logging is deprecated as of protocol version 2026-07-28.",
  inputSchema: {},
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Registers the 'trigger-log-messages' tool.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerLogMessagesTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (_args, ctx): Promise<CallToolResult> => {
      for (const level of LOGGING_LEVELS) {
        await ctx.mcpReq.log(level, `${level}-level message`, "everything");
      }
      return {
        content: [
          {
            type: "text",
            text:
              `Sent one log message at each of ${LOGGING_LEVELS.length} levels (${LOGGING_LEVELS.join(", ")}). ` +
              "The ones below this request's log level were dropped.",
          },
        ],
      };
    },
  );
};
