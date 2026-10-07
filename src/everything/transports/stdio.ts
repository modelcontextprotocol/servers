#!/usr/bin/env node

// The stdio transport manager: one server, connected to the process's own
// stdin/stdout, closed on SIGINT.
//
// It exports its start-up instead of running it at import (#4854), so a test
// can drive the same code in-process over a pair of streams and call the
// SIGINT handler directly, while `index.ts` still starts it the way a user
// launches the binary.

import type { Readable, Writable } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "../server/index.js";

/** What a started stdio server hands back: the server and its SIGINT handler. */
export type StdioSession = {
  server: ReturnType<typeof createServer>["server"];
  shutdown: () => Promise<void>;
};

/**
 * The main method
 * - Initializes the StdioServerTransport, sets up the server,
 * - Handles cleanup on process exit.
 *
 * @param stdin - The stream the server reads messages from (the process's stdin by default).
 * @param stdout - The stream the server writes messages to (the process's stdout by default).
 * @return {Promise<StdioSession>} The connected server and the handler registered for SIGINT.
 */
export async function main(
  stdin: Readable = process.stdin,
  stdout: Writable = process.stdout,
): Promise<StdioSession> {
  const transport = new StdioServerTransport(stdin, stdout);
  const { server, cleanup } = createServer();

  // Connect transport to server
  await server.connect(transport);

  // Cleanup on exit
  const shutdown = async () => {
    await server.close();
    cleanup();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);

  return { server, shutdown };
}

/**
 * Start the stdio server as the launcher does: announce it on stderr, run
 * `main()` (on the process's stdio unless other streams are given), and exit 1
 * if it fails.
 */
export async function startStdioServer(
  stdin?: Readable,
  stdout?: Writable,
): Promise<void> {
  console.error("Starting default (STDIO) server...");
  try {
    await main(stdin, stdout);
  } catch (error) {
    console.error("Server error:", error);
    process.exit(1);
  }
}
