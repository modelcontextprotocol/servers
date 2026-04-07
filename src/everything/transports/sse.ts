import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createServer } from "../server/index.js";
import cors from "cors";

console.error("Starting SSE server...");

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

// Authentication middleware: enforces Bearer token when MCP_AUTH_TOKEN is set
const authMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void => {
  const authToken = process.env.MCP_AUTH_TOKEN;
  if (!authToken) {
    // No auth token configured — skip enforcement (development mode)
    next();
    return;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ error: "Unauthorized: Missing or invalid Authorization header" });
    return;
  }
  const token = authHeader.slice(7);
  if (token !== authToken) {
    res.status(401).json({ error: "Unauthorized: Invalid token" });
    return;
  }
  next();
};

// Map sessionId to transport for each client
const transports: Map<string, SSEServerTransport> = new Map<
  string,
  SSEServerTransport
>();

// Handle GET requests for new SSE streams
app.get("/sse", authMiddleware, async (req, res) => {
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
app.post("/message", authMiddleware, async (req, res) => {
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
