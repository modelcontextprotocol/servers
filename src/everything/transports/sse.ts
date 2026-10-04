// The HTTP+SSE transport manager (deprecated transport; kept working): one
// server per `GET /sse` stream, with client messages posted to `/message`.
//
// `createApp()` builds the Express app without binding a port (#4854), so a
// test can serve it on a free port and drive it with a real client, and each
// app has its own session map. `startSseServer()` is what the launcher runs.

import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { type Express } from "express";
import type { Server } from "node:http";
import { createServer } from "../server/index.js";
import cors from "cors";
import { listenOrExit } from "./listen.js";

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
    let transport: SSEServerTransport;
    const { server, cleanup } = createServer();

    // Session Id should not exist for GET /sse requests
    if (req?.query?.sessionId) {
      const sessionId = req?.query?.sessionId as string;
      transport = transports.get(sessionId) as SSEServerTransport;
      console.error(
        "Client Reconnecting? This shouldn't happen; when client has a sessionId, GET /sse should not be called again.",
        transport.sessionId,
      );
    } else {
      // Create and store transport for the new session
      transport = new SSEServerTransport("/message", res);
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
    }
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
    } else {
      console.error(`No transport found for sessionId ${sessionId}`);
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
