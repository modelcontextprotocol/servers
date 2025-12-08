import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  beginSimulatedLogging,
  stopSimulatedLogging,
} from "../server/logging.js";

const name = "toggle-logging";
const config = {
  title: "Toggle Logging",
  description: "Toggles simulated logging on or off.",
  inputSchema: {},
};

const clients: Set<string | undefined> = new Set<string | undefined>();

/**
 * Registers a tool that toggles simulated logging for a session on or off.
 *
 * This function allows the server to manage simulated logging for client sessions.
 * When invoked, it either starts or stops simulated logging based on the session's
 * current state. If logging for the specified session is active, it will be stopped;
 * if it is inactive it will be started.
 *
 * @param {McpServer} server - The server instance to which the tool is registered.
 * @returns {void}
 */
export const registerToggleLoggingTool = (server: McpServer) => {
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
