#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../server/index.js";

console.error("Starting default (STDIO) server...");

/**
 * The main method
 * - Initializes the StdioServerTransport, sets up the server,
 * - Connects the transport to the server, invokes the `clientConnected` callback,
 * - Handles cleanup on process exit.
 *
 * @return {Promise<void>} A promise that resolves when the main function has executed and the process exits.
 */
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const { server, clientConnected, cleanup } = createServer();

  // Connect transport to server and invoke clientConnected callback
  await server.connect(transport);
  clientConnected();

  // Cleanup on exit
  process.on("SIGINT", async () => {
    await server.close();
    cleanup();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
