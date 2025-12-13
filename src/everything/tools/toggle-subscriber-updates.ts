import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  beginSimulatedResourceUpdates,
  stopSimulatedResourceUpdates,
} from "../resources/subscriptions.js";

// Tool configuration
const name = "toggle-subscriber-updates";
const config = {
  title: "Toggle Subscriber Updates",
  description: "Toggles simulated resource subscription updates on or off.",
  inputSchema: {},
};

// Track enabled clients by session id
const clients: Set<string | undefined> = new Set<string | undefined>();

/**
 * Registers the `toggle-subscriber-updates` tool.
 *
 * The registered tool enables or disables the sending of periodic, simulated resource
 * update messages the connected client for any subscriptions they have made.
 *
 * When invoked, it either starts or stops simulated resource updates based on the session's
 * current state. If simulated updates for the specified session is active, it will be stopped;
 * if it is inactive, simulated updates will be started.
 *
 * The response provides feedback indicating whether simulated updates were started or stopped,
 * including the session ID.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerToggleSubscriberUpdatesTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (_args, extra): Promise<CallToolResult> => {
      const sessionId = extra?.sessionId;

      let response: string;
      if (clients.has(sessionId)) {
        stopSimulatedResourceUpdates(sessionId);
        clients.delete(sessionId);
        response = `Stopped simulated resource updates for session ${sessionId}`;
      } else {
        beginSimulatedResourceUpdates(server, sessionId);
        clients.add(sessionId);
        response = `Started simulated resource updated notifications for session ${sessionId} at a 5 second pace. Client will receive updates for any resources the it is subscribed to.`;
      }

      return {
        content: [{ type: "text", text: `${response}` }],
      };
    }
  );
};
