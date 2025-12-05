import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../tools/index.js";
import { registerResources } from "../resources/index.js";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const instructions = readInstructions();

// Create the MCP resource server
export const createServer = () => {
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

  return {
    server,
    cleanup: () => {},
    startNotificationIntervals: (sessionId?: string) => {},
  };
};

function readInstructions(): string {
  let instructions;

  try {
    instructions = readFileSync(
      join(__dirname, "..", "docs", "server-instructions.md"),
      "utf-8"
    );
  } catch (e) {
    instructions = "Server instructions not loaded: " + e;
  }
  return instructions;
}
