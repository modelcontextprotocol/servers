#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer, cleanupSession } from "../server/index.js";

console.error("Starting default (STDIO) server...");

/**
 * Serve MCP over stdio, both protocol eras.
 *
 * `serveStdio` owns the era decision for the connection: the opening exchange
 * selects it (a `server/discover` probe means 2026-07-28, an `initialize`
 * handshake means the legacy era), one instance from the factory is pinned for
 * the connection lifetime, and everything after passes straight through. Pass
 * `{ legacy: "reject" }` to refuse legacy-era openings.
 *
 * This replaces the v1 `server.connect(new StdioServerTransport())` wiring,
 * which can only ever speak the legacy era.
 */
const handle = serveStdio((ctx) => createServer(ctx), {
  onerror: (error) => console.error("Server error:", error),
});

// Cleanup on exit. stdio has no session id, so the process-level simulation
// state is keyed under `undefined`.
process.on("SIGINT", async () => {
  await handle.close();
  cleanupSession();
  process.exit(0);
});
