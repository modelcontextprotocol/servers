#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./everything.js";

console.error('Starting default (STDIO) server...');

async function main() {
    const transport = new StdioServerTransport();
    const {server, cleanup, startNotificationIntervals} = createServer();

    // Cleanup when client disconnects
    server.onclose = async () => {
      await cleanup();
      process.exit(0);
    };

    await server.connect(transport);
    startNotificationIntervals();

    // Cleanup on exit
    process.on("SIGINT", async () => {
      await server.close();
    });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

