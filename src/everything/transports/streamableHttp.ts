// The Streamable HTTP transport manager: one server per session, created on
// the initialize POST to `/mcp`, with GET for the standalone SSE stream and
// DELETE to end the session.
//
// `createApp()` builds the Express app without binding a port or installing a
// signal handler (#4854), so a test can serve it on a free port, drive it with
// a real client, and call its shutdown handler directly; each app has its own
// session map. `startStreamableHttpServer()` is what the launcher runs.

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { createServer } from "../server/index.js";
import { randomUUID } from "node:crypto";
import cors from "cors";
import { listenOrExit } from "./listen.js";
import { InMemoryEventStore } from "./inMemoryEventStore.js";

/** The most of a refused POST's body read to find its request id. */
const MAX_ID_BODY_BYTES = 64 * 1024;

/**
 * The JSON-RPC `id` of a POST's body, or `null` when the body is not a single
 * request (a notification, a batch, malformed JSON, or larger than
 * `MAX_ID_BODY_BYTES`). Used only for a POST that is refused before the SDK
 * reads its body, so the error can still carry the request's id (#4982).
 */
async function readRequestId(req: Request): Promise<string | number | null> {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_ID_BODY_BYTES) return null;
      chunks.push(chunk as Buffer);
    }
    const id = JSON.parse(Buffer.concat(chunks).toString("utf8"))?.id;
    return typeof id === "string" || typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}

/**
 * Answer a request whose `Mcp-Session-Id` this app does not know, or has
 * ended: `404 Not Found`, which the spec makes the client's signal to start a
 * new session (#4982). Same shape as the SDK's own "Session not found".
 */
function sessionNotFound(res: Response, id: string | number | null = null) {
  res.status(404).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Session not found" },
    id,
  });
}

/** The Streamable HTTP app, and the handler the launcher installs for SIGINT. */
export type StreamableHttpApp = {
  app: Express;
  shutdown: () => Promise<void>;
};

/**
 * Build the Streamable HTTP transport's Express app: CORS, the `/mcp` POST,
 * GET and DELETE routes, the map from session id to transport that they
 * share, and the shutdown handler that walks that map.
 */
export function createApp(): StreamableHttpApp {
  // Express app with permissive CORS for testing with Inspector direct connect mode
  const app = express();
  app.use(
    cors({
      origin: "*", // use "*" with caution in production
      methods: "GET,POST,DELETE",
      preflightContinue: false,
      optionsSuccessStatus: 204,
      exposedHeaders: [
        "mcp-session-id",
        "last-event-id",
        "mcp-protocol-version",
      ],
    }),
  );

  // Map sessionId to server transport for each client
  const transports: Map<string, StreamableHTTPServerTransport> = new Map<
    string,
    StreamableHTTPServerTransport
  >();

  // Handle POST requests for client messages
  app.post("/mcp", async (req: Request, res: Response) => {
    console.log("Received MCP POST request");
    try {
      // Check for existing session ID
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        // Reuse existing transport
        transport = transports.get(sessionId)!;
      } else if (!sessionId) {
        const { server, cleanup } = createServer();

        // New initialization request
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore, // Enable resumability
          onsessioninitialized: (sessionId: string) => {
            // Store the transport by session ID when a session is initialized
            // This avoids race conditions where requests might come in before the session is stored
            console.log(`Session initialized with ID: ${sessionId}`);
            transports.set(sessionId, transport);
          },
        });

        // Set up onclose handler to clean up transport when closed
        server.server.onclose = async () => {
          const sid = transport.sessionId;
          if (sid && transports.has(sid)) {
            console.log(
              `Transport closed for session ${sid}, removing from transports map`,
            );
            transports.delete(sid);
            cleanup(sid);
          }
        };

        // Connect the transport to the MCP server BEFORE handling the request
        // so responses can flow back through the same transport
        await server.connect(transport);
        await transport.handleRequest(req, res);
        return;
      } else {
        // A session ID this app does not know, or has already ended
        sessionNotFound(res, await readRequestId(req));
        return;
      }

      // Handle the request with existing transport - no need to reconnect
      // The existing transport is already connected to the server
      await transport.handleRequest(req, res);
    } catch (error) {
      console.log("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: req?.body?.id,
        });
        return;
      }
    }
  });

  // Handle GET requests for SSE streams
  app.get("/mcp", async (req: Request, res: Response) => {
    console.log("Received MCP GET request");
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: req?.body?.id,
      });
      return;
    }
    if (!transports.has(sessionId)) {
      sessionNotFound(res);
      return;
    }

    // Check for Last-Event-ID header for resumability
    const lastEventId = req.headers["last-event-id"] as string | undefined;
    if (lastEventId) {
      console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
    } else {
      console.log(`Establishing new SSE stream for session ${sessionId}`);
    }

    const transport = transports.get(sessionId);
    await transport!.handleRequest(req, res);
  });

  // Handle DELETE requests for session termination
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: req?.body?.id,
      });
      return;
    }
    if (!transports.has(sessionId)) {
      sessionNotFound(res);
      return;
    }

    console.log(
      `Received session termination request for session ${sessionId}`,
    );

    try {
      const transport = transports.get(sessionId);
      await transport!.handleRequest(req, res);
    } catch (error) {
      console.log("Error handling session termination:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Error handling session termination",
          },
          id: req?.body?.id,
        });
        return;
      }
    }
  });

  // Handle server shutdown
  const shutdown = async () => {
    console.log("Shutting down server...");

    // Close all active transports to properly clean up resources
    // (a snapshot, since closing a transport removes it from the map)
    for (const [sessionId, transport] of [...transports]) {
      try {
        console.log(`Closing transport for session ${sessionId}`);
        await transport.close();
        transports.delete(sessionId);
      } catch (error) {
        console.log(`Error closing transport for session ${sessionId}:`, error);
      }
    }

    console.log("Server shutdown complete");
    process.exit(0);
  };

  return { app, shutdown };
}

/**
 * Start the Streamable HTTP server as the launcher does: build the app, bind
 * it to `PORT` (default 3001), and install its shutdown handler for SIGINT.
 */
export function startStreamableHttpServer(): Server {
  console.log("Starting Streamable HTTP server...");
  const { app, shutdown } = createApp();

  // Start the server
  const PORT = process.env.PORT || 3001;
  const httpServer = listenOrExit(
    app,
    PORT,
    `MCP Streamable HTTP Server listening on port ${PORT}`,
  );

  // Handle server shutdown
  process.on("SIGINT", shutdown);

  return httpServer;
}
