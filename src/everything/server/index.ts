import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  setSubscriptionHandlers,
  stopSimulatedResourceUpdates,
} from "../resources/subscriptions.js";
import { registerTools } from "../tools/index.js";
import { registerResources, readInstructions } from "../resources/index.js";
import { registerPrompts } from "../prompts/index.js";
import { stopSimulatedLogging } from "./logging.js";
import { syncRoots } from "./roots.js";

// Server Factory response
export type ServerFactoryResponse = {
  server: McpServer;
  clientConnected: (sessionId?: string) => void;
  cleanup: (sessionId?: string) => void;
};

/**
 * Server Factory
 *
 * This function initializes a `McpServer` with specific capabilities and instructions,
 * registers tools, resources, and prompts, and configures resource subscription handlers.
 *
 * It returns the server instance along with callbacks for post-connection setup and cleanup tasks.
 *
 * @function
 * @returns {ServerFactoryResponse} An object containing the server instance, a `clientConnected` callback
 * for managing new client sessions, and a `cleanup` function for handling server-side cleanup when
 * a session ends.
 *
 * Properties of the returned object:
 * - `server` {Object}: The initialized server instance.
 * - `clientConnected` {Function}: A post-connect callback to enable operations that require a `sessionId`.
 * - `cleanup` {Function}: Function to perform cleanup operations for a closing session.
 */
export const createServer: () => ServerFactoryResponse = () => {
  // Read the server instructions
  const instructions = readInstructions();

  // Create the server
  const server = new McpServer(
    {
      name: "mcp-servers/everything",
      title: "Everything Reference Server",
      version: "2.0.0",
    },
    {
      capabilities: {
        tools: {},
        logging: {},
        prompts: {},
        resources: {
          subscribe: true,
        },
      },
      instructions,
    }
  );

  // Register the tools
  registerTools(server);

  // Register the resources
  registerResources(server);

  // Register the prompts
  registerPrompts(server);

  // Set resource subscription handlers
  setSubscriptionHandlers(server);

  // Return the ServerFactoryResponse
  return {
    server,
    clientConnected: (sessionId?: string) => {
      // Set a roots list changed handler and fetch the initial roots list from the client
      syncRoots(server, sessionId);
    },
    cleanup: (sessionId?: string) => {
      // Stop any simulated logging or resource updates that may have been initiated.
      stopSimulatedLogging(sessionId);
      stopSimulatedResourceUpdates(sessionId);
    },
  } satisfies ServerFactoryResponse;
};
