// The HTTP+SSE transport manager (deprecated transport; kept working): one
// server per `GET /sse` stream, with client messages posted to `/message`.
//
// `createApp()` builds the Express app without binding a port (#4854), so a
// test can serve it on a free port and drive it with a real client, and each
// app has its own session map. `startSseServer()` is what the launcher runs.

import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { type Express, type Response } from "express";
import type { Server } from "node:http";
import { createServer } from "../server/index.js";
import cors from "cors";
import { listenOrExit } from "./listen.js";

/**
 * Answer a request the transport cannot serve with a JSON-RPC error body, as
 * the Streamable HTTP transport does, so the client is not left waiting.
 */
function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

/**
 * Build the SSE transport's Express app: CORS, `GET /sse` and `POST /message`,
 * and the map from session id to transport that they share.
 */
export function createApp(): Express {
  // Express app with permissive CORS for testing with Inspector direct connect mode
  const app = express();
  app.use(
    cors({
      origin: "*", // use "*" with caution in production
      methods: "GET,POST",
      preflightContinue: false,
      optionsSuccessStatus: 204,
    }),
  );

  // Map sessionId to transport for each client
  const transports: Map<string, SSEServerTransport> = new Map<
    string,
    SSEServerTransport
  >();

  // Handle GET requests for new SSE streams
  app.get("/sse", async (req, res) => {
    // Session Id should not exist for GET /sse requests: each stream is a new
    // session. Answer one that names a session rather than leaving it hanging
    // (#4981): 409 if that session already has its stream, 404 if it is unknown.
    if (req?.query?.sessionId) {
      const sessionId = String(req.query.sessionId);
      if (transports.has(sessionId)) {
        console.error(
          "Client Reconnecting? This shouldn't happen; when client has a sessionId, GET /sse should not be called again.",
          sessionId,
        );
        sendError(res, 409, "Conflict: this session already has an SSE stream");
      } else {
        console.error(`No transport found for sessionId ${sessionId}`);
        sendError(res, 404, "Session not found");
      }
      return;
    }

    // Create and store transport for the new session
    const { server, cleanup } = createServer();
    const transport = new SSEServerTransport("/message", res);
    transports.set(transport.sessionId, transport);

    // Connect server to transport
    await server.connect(transport);
    const sessionId = transport.sessionId;
    console.error("Client Connected: ", sessionId);

    // Handle close of connection
    server.server.onclose = async () => {
      const sessionId = transport.sessionId;
      console.error("Client Disconnected: ", sessionId);
      transports.delete(sessionId);
      cleanup(sessionId);
    };
  });

  // Handle POST requests for client messages
  app.post("/message", async (req, res) => {
    // Session Id should exist for POST /message requests
    const sessionId = req?.query?.sessionId as string;

    // Get the transport for this session and use it to handle the request
    const transport = transports.get(sessionId);
    if (transport) {
      console.error("Client Message from", sessionId);
      await transport.handlePostMessage(req, res);
    } else if (!sessionId) {
      // Answer rather than leave the request hanging (#4981)
      console.error("No sessionId in POST /message");
      sendError(res, 400, "Bad Request: sessionId query parameter is required");
    } else {
      console.error(`No transport found for sessionId ${sessionId}`);
      sendError(res, 404, "Session not found");
    }
  });

  return app;
}

/**
 * Start the SSE server as the launcher does: build the app and bind it to
 * `PORT` (default 3001).
 */
export function startSseServer(): Server {
  console.error("Starting SSE server...");
  const app = createApp();

  // Start the express server
  const PORT = process.env.PORT || 3001;
  return listenOrExit(app, PORT, `Server is running on port ${PORT}`);
}
