import { SSEServerTransport } from "@modelcontextprotocol/server-legacy/sse";
import express from "express";
import cors from "cors";
import { createServer, cleanupSession } from "../server/index.js";

/**
 * The deprecated HTTP+SSE transport (protocol revision 2024-11-05).
 *
 * This transport is **legacy-era only** -- it predates Streamable HTTP and has no
 * 2026-07-28 equivalent. It is served here from
 * `@modelcontextprotocol/server-legacy`, a frozen copy of the v1 transport kept
 * for migration only. New clients should use `streamableHttp`, which serves
 * both eras from one endpoint.
 */
console.error("Starting SSE server (deprecated, legacy-era only)...");

// Express app with permissive CORS for testing with Inspector direct connect mode
const app = express();
app.use(
  cors({
    origin: "*", // use "*" with caution in production
    methods: "GET,POST",
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

// Map sessionId to transport for each client
const transports: Map<string, SSEServerTransport> = new Map<
  string,
  SSEServerTransport
>();

// Handle GET requests for new SSE streams
app.get("/sse", async (req, res) => {
  let transport: SSEServerTransport;

  // Session Id should not exist for GET /sse requests
  if (req?.query?.sessionId) {
    const sessionId = req?.query?.sessionId as string;
    transport = transports.get(sessionId) as SSEServerTransport;
    console.error(
      "Client Reconnecting? This shouldn't happen; when client has a sessionId, GET /sse should not be called again.",
      transport.sessionId
    );
  } else {
    // This transport only ever serves the legacy era, so the factory is built
    // with an explicit legacy construction context.
    const server = createServer({ era: "legacy" });

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
      cleanupSession(sessionId);
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

// Start the express server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.error(`Server is running on port ${PORT}`);
});
