import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  InMemoryTaskStore,
  InMemoryTaskMessageQueue,
} from "@modelcontextprotocol/sdk/experimental/tasks";
import {
  setSubscriptionHandlers,
  stopSimulatedResourceUpdates,
} from "../resources/subscriptions.js";
import { registerConditionalTools, registerTools } from "../tools/index.js";
import { registerResources, readInstructions } from "../resources/index.js";
import { registerPrompts } from "../prompts/index.js";
import { stopSimulatedLogging } from "./logging.js";
import { syncRoots } from "./roots.js";
import { validateDeclarationManifest } from "./declaration-manifest.js";

const KNOWN_EVERYTHING_DECLARATIONS = {
  tools: new Set<string>([
    "echo",
    "get-annotated-message",
    "get-env",
    "get-resource-links",
    "get-resource-reference",
    "get-roots-list",
    "get-structured-content",
    "get-sum",
    "get-tiny-image",
    "gzip-file-as-resource",
    "simulate-research-query",
    "toggle-simulated-logging",
    "toggle-subscriber-updates",
    "trigger-elicitation-request",
    "trigger-elicitation-request-async",
    "trigger-long-running-operation",
    "trigger-sampling-request",
    "trigger-sampling-request-async",
  ]),
  resources: new Set<string>(["resource-templates", "file-resources"]),
  prompts: new Set<string>([
    "simple-prompt",
    "args-prompt",
    "completable-prompt",
    "resource-prompt",
  ]),
};

// Server Factory response
export type ServerFactoryResponse = {
  server: McpServer;
  cleanup: (sessionId?: string) => void;
};

/**
 * Server Factory
 *
 * This function initializes a `McpServer` with specific capabilities and instructions,
 * registers tools, resources, and prompts, and configures resource subscription handlers.
 *
 * @returns {ServerFactoryResponse} An object containing the server instance, and a `cleanup`
 * function for handling server-side cleanup when a session ends.
 *
 * Properties of the returned object:
 * - `server` {Object}: The initialized server instance.
 * - `cleanup` {Function}: Function to perform cleanup operations for a closing session.
 */
export const createServer: () => ServerFactoryResponse = () => {
  validateDeclarationManifest(
    process.env.MCP_DECLARATION_MANIFEST,
    KNOWN_EVERYTHING_DECLARATIONS
  );

  // Read the server instructions
  const instructions = readInstructions();

  // Create task store and message queue for task support
  const taskStore = new InMemoryTaskStore();
  const taskMessageQueue = new InMemoryTaskMessageQueue();

  let initializeTimeout: NodeJS.Timeout | null = null;

  // Create the server
  const server = new McpServer(
    {
      name: "mcp-servers/everything",
      title: "Everything Reference Server",
      version: "2.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
        prompts: {
          listChanged: true,
        },
        resources: {
          subscribe: true,
          listChanged: true,
        },
        logging: {},
        tasks: {
          list: {},
          cancel: {},
          requests: {
            tools: {
              call: {},
            },
          },
        },
      },
      instructions,
      taskStore,
      taskMessageQueue,
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

  // Perform post-initialization operations
  server.server.oninitialized = async () => {
    // Register conditional tools now that client capabilities are known.
    // This finishes before the `notifications/initialized` handler finishes.
    registerConditionalTools(server);

    // Sync roots if the client supports them.
    // This is delayed until after the `notifications/initialized` handler finishes,
    // otherwise, the request gets lost.
    const sessionId = server.server.transport?.sessionId;
    initializeTimeout = setTimeout(() => syncRoots(server, sessionId), 350);
  };

  // Return the ServerFactoryResponse
  return {
    server,
    cleanup: (sessionId?: string) => {
      // Stop any simulated logging or resource updates that may have been initiated.
      stopSimulatedLogging(sessionId);
      stopSimulatedResourceUpdates(sessionId);
      // Clean up task store timers
      taskStore.cleanup();
      if (initializeTimeout) clearTimeout(initializeTimeout);
    },
  } satisfies ServerFactoryResponse;
};
