import { LoggingLevel } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Map session ID to the interval for sending logging messages to the client
const logsUpdateIntervals: Map<string | undefined, NodeJS.Timeout | undefined> =
  new Map<string | undefined, NodeJS.Timeout | undefined>();

/**
 * Initiates a simulated logging process by sending random log messages to the client at a
 * fixed interval. Each log message contains a random logging level and optional session ID.
 *
 * @param {McpServer} server - The server instance responsible for handling the logging messages.
 * @param {string | undefined} sessionId - An optional identifier for the session. If provided,
 * the session ID will be appended to log messages.
 */
export const beginSimulatedLogging = (
  server: McpServer,
  sessionId: string | undefined
) => {
  const maybeAppendSessionId = sessionId ? ` - SessionId ${sessionId}` : "";
  const messages: { level: LoggingLevel; data: string }[] = [
    { level: "debug", data: `Debug-level message${maybeAppendSessionId}` },
    { level: "info", data: `Info-level message${maybeAppendSessionId}` },
    { level: "notice", data: `Notice-level message${maybeAppendSessionId}` },
    {
      level: "warning",
      data: `Warning-level message${maybeAppendSessionId}`,
    },
    { level: "error", data: `Error-level message${maybeAppendSessionId}` },
    {
      level: "critical",
      data: `Critical-level message${maybeAppendSessionId}`,
    },
    { level: "alert", data: `Alert level-message${maybeAppendSessionId}` },
    {
      level: "emergency",
      data: `Emergency-level message${maybeAppendSessionId}`,
    },
  ];

  /**
   * Send a simulated logging message to the client
   */
  const sendSimulatedLoggingMessage = async (sessionId: string | undefined) => {
    // By using the `sendLoggingMessage` function to send the message, we
    // ensure that the client's chosen logging level will be respected
    await server.sendLoggingMessage(
      messages[Math.floor(Math.random() * messages.length)],
      sessionId
    );
  };

  // Set the interval to send later logging messages to this client
  if (!logsUpdateIntervals.has(sessionId)) {
    // Send once immediately
    sendSimulatedLoggingMessage(sessionId);

    // Send a randomly-leveled log message every 5 seconds
    logsUpdateIntervals.set(
      sessionId,
      setInterval(() => sendSimulatedLoggingMessage(sessionId), 5000)
    );
  }
};

/**
 * Stops the simulated logging process for a given session.
 *
 * This function halts the periodic logging updates associated with the specified
 * session ID by clearing the interval and removing the session's tracking
 * reference. Session ID can be undefined for stdio.
 *
 * @param {string} [sessionId] - The optional unique identifier of the session.
 */
export const stopSimulatedLogging = (sessionId?: string) => {
  // Remove active intervals
  if (logsUpdateIntervals.has(sessionId)) {
    const logsUpdateInterval = logsUpdateIntervals.get(sessionId);
    clearInterval(logsUpdateInterval);
    logsUpdateIntervals.delete(sessionId);
  }
};
