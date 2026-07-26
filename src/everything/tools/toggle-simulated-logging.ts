import { McpServer } from "@modelcontextprotocol/server";
import { CallToolResult } from "@modelcontextprotocol/server";
import {
  beginSimulatedLogging,
  stopSimulatedLogging,
} from "../server/logging.js";

// Tool configuration
const name = "toggle-simulated-logging";
const config = {
  title: "Toggle Simulated Logging",
  description:
    "Toggles simulated, random-leveled logging on or off. " +
    "Legacy-era connections only (protocol revisions 2024-10-07 through " +
    "2025-11-25): this streams unsolicited notifications/message over the " +
    "connection, which the 2026-07-28 revision does not have. On a 2026-07-28 " +
    "connection the toggle is accepted but no log messages arrive.",
  inputSchema: {},
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

// Track enabled clients by session id
const clients: Set<string | undefined> = new Set<string | undefined>();

/**
 * Registers the `toggle-simulated-logging` tool.
 *
 * The registered tool enables or disables the sending of periodic, random-leveled
 * logging messages the connected client.
 *
 * When invoked, it either starts or stops simulated logging based on the session's
 * current state. If logging for the specified session is active, it will be stopped;
 * if it is inactive, logging will be started.
 *
 * ## legacy-era only
 *
 * This is the one tool here that cannot be made era-agnostic. It models a
 * *connection-scoped* log stream: a background interval pushing unsolicited
 * `notifications/message` at whatever level the client selected with
 * `logging/setLevel`.
 *
 * 2026-07-28 removed both halves of that. `logging/setLevel` is gone -- the log
 * level is now a per-request `io.modelcontextprotocol/logLevel` key in `_meta`
 * -- and a server MUST NOT emit `notifications/message` for a request that did
 * not carry it. There is no connection-level channel to stream logs on, so
 * there is nothing for a background interval to write to.
 *
 * The failure is quiet rather than loud: `sendLoggingMessage` filters the
 * message out instead of rejecting, so the interval keeps running harmlessly
 * and the server stays healthy (verified on both eras). A modern client simply
 * never receives anything, which is why the tool's description says so up front.
 *
 * The era-agnostic equivalent would be a request-scoped burst via
 * `ctx.mcpReq.log()` during the call, which works on both eras but demonstrates
 * something different from a background stream.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerToggleSimulatedLoggingTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (_args, extra): Promise<CallToolResult> => {
      const sessionId = extra?.sessionId;

      let response: string;
      if (clients.has(sessionId)) {
        stopSimulatedLogging(sessionId);
        clients.delete(sessionId);
        response = `Stopped simulated logging for session ${sessionId}`;
      } else {
        beginSimulatedLogging(server, sessionId);
        clients.add(sessionId);
        response = `Started simulated, random-leveled logging for session ${sessionId} at a 5 second pace. Client's selected logging level will be respected. If an interval elapses and the message to be sent is below the selected level, it will not be sent. Thus at higher chosen logging levels, messages should arrive further apart. `;
      }

      return {
        content: [{ type: "text", text: `${response}` }],
      };
    }
  );
};
