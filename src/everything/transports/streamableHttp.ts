// The Streamable HTTP transport manager: one `/mcp` endpoint serving both
// protocol eras (#4852).
//
// - 2026-07-28 traffic (a request carrying the per-request `_meta` envelope)
//   goes to the SDK's `createMcpHandler`, which builds a fresh server per
//   request: no sessions, `server/discover` instead of `initialize`, change
//   notifications on `subscriptions/listen` streams published through the
//   handler's bus, and input requests in-band (`input_required`).
// - 2025-era traffic keeps the sessionful wiring it had: one server per
//   session, created on the initialize POST, with GET for the standalone SSE
//   stream, DELETE to end the session, and an event store for resumability.
//   The SDK's default 2025-era serving is stateless, which would leave no
//   channel for server-to-client requests, so elicitation, sampling and roots
//   would stop working for 2025-era HTTP clients; routing them here keeps them
//   working, the pattern the SDK documents for an existing sessionful
//   deployment.
//
// A request with an `Mcp-Session-Id`, a GET and a DELETE are 2025-era by
// definition, since 2026-07-28 has none of them. A session-less POST is
// classified by the SDK's own `isLegacyRequest`, from a body parsed once and
// handed to whichever side serves it.
//
// `createApp()` builds the Express app without binding a port or installing a
// signal handler (#4854), so a test can serve it on a free port, drive it with
// a real client, and call its shutdown handler directly; each app has its own
// session map and its own 2026-07-28 handler. `startStreamableHttpServer()` is
// what the launcher runs.

import {
  createMcpHandler,
  isJSONRPCRequest,
  isLegacyRequest,
} from "@modelcontextprotocol/server";
import {
  localhostOriginValidation,
  NodeStreamableHTTPServerTransport,
  toNodeHandler,
  toWebRequest,
} from "@modelcontextprotocol/node";
import express, { Express, NextFunction, Request, Response } from "express";
import type { Server } from "node:http";
import { createServer } from "../server/index.js";
import { randomUUID } from "node:crypto";
import cors from "cors";
import { listenOrExit } from "./listen.js";
import { InMemoryEventStore } from "./in-memory-event-store.js";

/** The most bytes of a refused POST's body read to find its request id. */
const MAX_ID_BODY_BYTES = 64 * 1024;

/**
 * The JSON-RPC `id` of a POST's body, or `null` when the body is not a single
 * JSON-RPC request (a notification, a response, a batch, any other JSON,
 * malformed JSON, or larger than `MAX_ID_BODY_BYTES`). Used only for a POST that is refused before the SDK
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
    const message: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return isJSONRPCRequest(message) ? message.id : null;
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

/** The most bytes of a session-less POST body parsed to classify it (4 MiB, the SDK's own bound). */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Parses a session-less POST's JSON body, to classify it and to serve it. */
const parseJson = express.json({
  limit: MAX_BODY_BYTES,
  type: () => true,
  // Any JSON value parses, so a primitive body reaches the SDK, which answers
  // it as an invalid request (-32600); -32700 is only for text that is not JSON.
  strict: false,
});

/**
 * Answer a session-less POST whose body could not be parsed the way the SDK
 * answers one: a JSON-RPC error with a null id, as 400 (not JSON) or 413 (too
 * large). Anything else goes on to Express's error handling.
 */
function bodyError(
  error: { type?: string },
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (error.type === "entity.parse.failed") {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32700,
        message: "Parse error: the request body is not valid JSON",
      },
      id: null,
    });
  } else if (error.type === "entity.too.large") {
    res.status(413).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Request body too large" },
      id: null,
    });
  } else {
    next(error);
  }
}

/** The Streamable HTTP app, and the handler the launcher installs for SIGINT. */
export type StreamableHttpApp = {
  app: Express;
  shutdown: () => Promise<void>;
};

/**
 * Build the Streamable HTTP transport's Express app: Origin validation, CORS,
 * the `/mcp` POST, GET and DELETE routes, the map from session id to
 * transport that they share, the 2026-07-28 handler, and the shutdown handler
 * that closes them.
 */
export function createApp(): StreamableHttpApp {
  const app = express();
  // A browser page may reach this server only from a localhost origin. The
  // SDK's guard answers any other Origin with a 403 before a route or the
  // CORS middleware sees it, preflights included; a request with no Origin
  // (a non-browser client) passes. CORS then grants the origin that passed,
  // so the Inspector's direct connect mode keeps working from localhost.
  const allowOrigin = localhostOriginValidation();
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (allowOrigin(req, res)) next();
  });
  app.use(
    cors({
      origin: true,
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

  // The 2026-07-28 side: a fresh server per request, built for the modern
  // era. Its change notifications go out on the handler's subscription bus,
  // which reaches every open subscriptions/listen stream that asked for them.
  // It refuses 2025-era traffic, which the routes below never send it.
  const modern = createMcpHandler(
    () =>
      createServer({
        era: "modern",
        publish: {
          toolsChanged: () => modern.notify.toolsChanged(),
          promptsChanged: () => modern.notify.promptsChanged(),
          resourcesChanged: () => modern.notify.resourcesChanged(),
          resourceUpdated: (uri) => modern.notify.resourceUpdated(uri),
        },
      }).server,
    {
      legacy: "reject",
      onerror: (error) => console.log("Error serving MCP request:", error),
    },
  );
  const serveModern = toNodeHandler(modern);

  // Map sessionId to server transport for each client
  const transports: Map<string, NodeStreamableHTTPServerTransport> = new Map<
    string,
    NodeStreamableHTTPServerTransport
  >();

  // A session-less POST's body is parsed once, to classify it and serve it.
  // A POST with a session id is a 2025-era session's, and its transport reads
  // the body itself.
  app.post(
    "/mcp",
    (req: Request, res: Response, next: NextFunction) =>
      req.headers["mcp-session-id"] ? next() : parseJson(req, res, next),
    bodyError,
  );

  // Handle POST requests for client messages
  app.post("/mcp", async (req: Request, res: Response) => {
    console.log("Received MCP POST request");
    try {
      // Check for existing session ID
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      // A session-less POST that carries the 2026-07-28 envelope is served
      // by the modern handler; everything else stays on the 2025-era path.
      if (
        !sessionId &&
        !(await isLegacyRequest(await toWebRequest(req, req.body)))
      ) {
        await serveModern(req, res, req.body);
        return;
      }

      let transport: NodeStreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        // Reuse existing transport
        transport = transports.get(sessionId)!;
      } else if (!sessionId) {
        const { server, cleanup } = createServer();

        // New initialization request
        const eventStore = new InMemoryEventStore();
        transport = new NodeStreamableHTTPServerTransport({
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
            cleanup();
          }
        };

        // Connect the transport to the MCP server BEFORE handling the request
        // so responses can flow back through the same transport
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
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

    // End the 2026-07-28 requests and subscription streams in flight
    await modern.close();

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
