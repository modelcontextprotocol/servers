#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../server/index.js";

console.error("Starting default (STDIO) server...");

async function main() {
  const transport = new StdioServerTransport();
  const { server, clientConnected, cleanup } = createServer();

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
