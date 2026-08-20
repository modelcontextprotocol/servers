import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import express from "express";
import cors from "cors";
import { createServer } from "../server/index.js";
import { setBusNotifier } from "../server/notifier.js";

console.log("Starting Streamable HTTP server...");

/**
 * Serve MCP over Streamable HTTP, both protocol eras, from one endpoint.
 *
 * `createMcpHandler` serves 2026-07-28 per request and -- on its default
 * `legacy: "stateless"` posture -- also serves legacy-era traffic per request
 * through the established stateless idiom, from the same factory.
 *
 * This replaces the v1 wiring, which is gone in its entirety:
 *
 * - the `Map<sessionId, StreamableHTTPServerTransport>` and the
 *   `mcp-session-id` plumbing: 2026-07-28 removed protocol-level sessions,
 *   and the legacy leg is stateless per request;
 * - the `InMemoryEventStore` and `Last-Event-ID` replay: 2026-07-28 removed
 *   SSE resumability outright (a broken stream loses the in-flight request and
 *   the client re-issues it with a fresh id);
 * - the hand-rolled GET and DELETE routes: GET was the 2025 standalone
 *   notification stream, replaced by `subscriptions/listen`, which the handler
 *   answers itself. The handler returns `405` for GET/DELETE on the legacy leg.
 */
const handler = createMcpHandler((ctx) => createServer(ctx), {
  onerror: (error) => console.error("MCP handler error:", error),
});

// Change notifications published by tools have to reach the handler's
// `subscriptions/listen` streams. Per-request instances have no long-lived
// stream of their own, so the publish path is the handler's bus.
setBusNotifier(handler.notify);

// Express app with permissive CORS for testing with Inspector direct connect mode
const app = express();
app.use(
  cors({
    origin: "*", // use "*" with caution in production
    methods: "GET,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204,
    // `mcp-session-id` and `last-event-id` are legacy-era only and are kept so
    // this endpoint stays usable by legacy clients. `mcp-protocol-version` is
    // read on both eras.
    exposedHeaders: ["mcp-session-id", "last-event-id", "mcp-protocol-version"],
  })
);

// One route, both eras, every method. The handler classifies each request
// (modern envelope vs. legacy) and routes it internally.
app.all("/mcp", toNodeHandler(handler));

// Start the server
const PORT = process.env.PORT || 3001;
const httpServer = app.listen(PORT, () => {
  console.error(`MCP Streamable HTTP Server listening on port ${PORT}`);
});

// Handle server errors
httpServer.on("error", (err: unknown) => {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;
  if (code === "EADDRINUSE") {
    console.error(
      `Failed to start: Port ${PORT} is already in use. Set PORT to a free port or stop the conflicting process.`
    );
  } else {
    console.error("HTTP server encountered an error while starting:", err);
  }
  // Ensure a non-zero exit so npm reports the failure instead of silently exiting
  process.exit(1);
});

// Handle server shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down server...");

  // Aborts in-flight modern exchanges, closes their per-request instances, and
  // sends the graceful-close result on every open `subscriptions/listen` stream.
  await handler.close();
  setBusNotifier(undefined);

  // `close()` stops new connections but resolves only once the existing ones
  // end, and it is callback-based -- exiting straight after calling it can kill
  // the process with the listen socket still open and pending writes unflushed.
  // Drop keep-alive sockets first so the close can actually complete, then wait
  // for it.
  httpServer.closeAllConnections();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));

  console.log("Server shutdown complete");
  process.exit(0);
});
