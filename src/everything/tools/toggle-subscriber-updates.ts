import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  beginSimulatedResourceUpdates,
  stopSimulatedResourceUpdates,
} from "../resources/subscriptions.js";

const name = "toggle-subscriber-updates";
const config = {
  title: "Toggle Subscriber Updates",
  description: "Toggles simulated resource subscription updates on or off.",
  inputSchema: {},
};

const clients: Set<string | undefined> = new Set<string | undefined>();

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
