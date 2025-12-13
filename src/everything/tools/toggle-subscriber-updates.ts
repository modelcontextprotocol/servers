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
 * Registers the `toggle-subscriber-updates` tool with the provided MCP server.
 *
 * The registered tool toggles the state of the simulated resource update mechanism for the client.
 * - When enabled, the simulated resource updates are sent to the client at a regular interval.
 * - When disabled, updates are stopped for the session.
 *
 * The response provides feedback indicating whether simulated updates were started or stopped,
 * including the session ID.
 *
 * @param {McpServer} server - The MCP server instance on which the tool is registered.
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
