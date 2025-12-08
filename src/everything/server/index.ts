import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import {
  setSubscriptionHandlers,
  stopSimulatedResourceUpdates,
} from "../resources/subscriptions.js";
import { registerTools } from "../tools/index.js";
import { registerResources } from "../resources/index.js";
import { registerPrompts } from "../prompts/index.js";
import { stopSimulatedLogging } from "./logging.js";

// Everything Server factory
export const createServer = () => {
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

  // Return server instance and cleanup function
  return {
    server,
    cleanup: (sessionId?: string) => {
      // Stop any simulated logging or resource updates that may have been initiated.
      stopSimulatedLogging(sessionId);
      stopSimulatedResourceUpdates(sessionId);
    },
  };
};

// Read the server instructions from a file
function readInstructions(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const filePath = join(__dirname, "..", "docs", "server-instructions.md");
  let instructions;

  try {
    instructions = readFileSync(filePath, "utf-8");
  } catch (e) {
    instructions = "Server instructions not loaded: " + e;
  }
  return instructions;
}
