import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createServer } from "../server/index.js";
import cors from "cors";
import { createCorsOptions } from "./cors.js";

console.error("Starting SSE server...");

// Express app with loopback-only CORS by default for Inspector direct connect mode.
// Override via MCP_CORS_ORIGIN_REGEX if you intentionally need a wider allowlist.
const app = express();
app.use(
  cors(
    createCorsOptions({
      methods: "GET,POST",
    })
  )
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
      transport.sessionId
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

// Start the express server
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
if (!Number.isFinite(PORT)) {
  throw new Error(`Invalid PORT=${JSON.stringify(process.env.PORT)}`);
}
const HOST = process.env.HOST || "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.error(`Server is running on http://${HOST}:${PORT}`);
});
