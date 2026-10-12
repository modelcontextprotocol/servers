#!/usr/bin/env node

// The stdio transport manager: the server factory, served on the process's
// own stdin/stdout through the SDK's `serveStdio` entry, closed on SIGINT.
//
// `serveStdio` lets the client's first message pick the connection's
// protocol era (#4852): a 2026-07-28 client opens with `server/discover` (or
// any request carrying the per-request `_meta` envelope) and a 2025-era
// client with `initialize`. It then builds one server for that era from the
// factory and pins it to the connection. It may build and discard one more
// first, to answer a discover probe, so each instance's cleanup runs when that
// instance closes.
//
// It exports its start-up instead of running it at import (#4854), so a test
// can drive the same code in-process over a pair of streams and call the
// SIGINT handler directly, while `index.ts` still starts it the way a user
// launches the binary.

import type { Readable, Writable } from "node:stream";
import {
  serveStdio,
  StdioServerTransport,
  type StdioServerHandle,
} from "@modelcontextprotocol/server/stdio";
import { createServer } from "../server/index.js";

/** What a started stdio server hands back: the connection and its SIGINT handler. */
export type StdioSession = {
  handle: StdioServerHandle;
  shutdown: () => Promise<void>;
};

/**
 * The main method
 * - Serves the server factory over a StdioServerTransport,
 * - Handles cleanup on process exit.
 *
 * @param stdin - The stream the server reads messages from (the process's stdin by default).
 * @param stdout - The stream the server writes messages to (the process's stdout by default).
 * @return {Promise<StdioSession>} The served connection and the handler registered for SIGINT.
 */
export async function main(
  stdin: Readable = process.stdin,
  stdout: Writable = process.stdout,
): Promise<StdioSession> {
  // The cleanups of the instances still open
  const cleanups = new Set<() => void>();

  const handle = serveStdio(
    ({ era }) => {
      const { server, cleanup } = createServer({ era });
      cleanups.add(cleanup);
      server.server.onclose = () => {
        cleanups.delete(cleanup);
        cleanup();
      };
      return server;
    },
    {
      transport: new StdioServerTransport(stdin, stdout),
      // serveStdio reports a transport that fails, including one that cannot
      // start, here rather than by rejecting, so record the failure in the
      // exit status for whatever supervises the process.
      onerror: (error) => {
        console.error("Transport error:", error);
        process.exitCode = 1;
      },
    },
  );

  // Cleanup on exit
  const shutdown = async () => {
    await handle.close();
    for (const cleanup of cleanups) cleanup();
    cleanups.clear();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);

  return { handle, shutdown };
}

/**
 * Start the stdio server as the launcher does: announce it on stderr and run
 * `main()` on the process's stdio unless other streams are given. A transport
 * that fails, including one that cannot start, is reported on stderr.
 */
export async function startStdioServer(
  stdin?: Readable,
  stdout?: Writable,
): Promise<void> {
  console.error("Starting default (STDIO) server...");
  await main(stdin, stdout);
}
