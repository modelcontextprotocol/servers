// Simulated logging for `toggle-simulated-logging`: a timer that sends a
// random-leveled `notifications/message` every five seconds, filtered by the
// level the client set with `logging/setLevel`.
//
// This is 2025-era behavior. The 2026-07-28 revision removes
// `logging/setLevel` and unsolicited log messages: a log message is sent only
// during a request, at the level that request names in its `_meta`
// (`trigger-log-messages` shows that). Logging itself is deprecated as of
// 2026-07-28 (SEP-2577). The timer belongs to one server instance, the one
// serving the client's connection or session, so no session map is needed
// (#4852).

import { LoggingLevel, McpServer } from "@modelcontextprotocol/server";

/** One message per logging level, from least to most severe. */
const MESSAGES: { level: LoggingLevel; data: string }[] = [
  { level: "debug", data: "Debug-level message" },
  { level: "info", data: "Info-level message" },
  { level: "notice", data: "Notice-level message" },
  { level: "warning", data: "Warning-level message" },
  { level: "error", data: "Error-level message" },
  { level: "critical", data: "Critical-level message" },
  { level: "alert", data: "Alert level-message" },
  { level: "emergency", data: "Emergency-level message" },
];

/**
 * Start sending `server`'s client a random-leveled log message now and then
 * every five seconds. The SDK drops a message below the level the client set.
 *
 * @param {McpServer} server - The server whose client receives the messages.
 * @returns {() => void} Stops the messages.
 */
export const beginSimulatedLogging = (server: McpServer): (() => void) => {
  // Fire-and-forget: this runs on a timer with no caller to await it. A send
  // that fails (e.g. the transport closed before logging was stopped) is
  // logged rather than left to become an unhandled rejection.
  const send = () =>
    server
      .sendLoggingMessage(
        MESSAGES[Math.floor(Math.random() * MESSAGES.length)],
        // The SDK keeps the level the client set per transport session, so
        // the filter is looked up by this connection's session id.
        server.server.transport?.sessionId,
      )
      .catch((error: unknown) =>
        console.error("Simulated logging message failed:", error),
      );
  void send();
  const interval = setInterval(() => void send(), 5000);
  return () => clearInterval(interval);
};
