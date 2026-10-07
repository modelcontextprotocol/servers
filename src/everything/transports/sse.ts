import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { type Express } from "express";
import { createServer } from "../server/index.js";
import cors from "cors";

type ServerFactory = typeof createServer;

export function createSseApp(
  transports: Map<string, SSEServerTransport> = new Map(),
  serverFactory: ServerFactory = createServer
): Express {
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

  // Handle GET requests for new SSE streams
  app.get("/sse", async (req, res) => {
    // Session Id should not exist for GET /sse requests
    if (req?.query?.sessionId) {
      const sessionId = String(req.query.sessionId);
      const transport = transports.get(sessionId);
      if (!transport) {
        res.status(404).json({
          error: `No transport found for sessionId ${sessionId}`,
        });
        return;
      }

      console.error(
        "Client Reconnecting? This shouldn't happen; when client has a sessionId, GET /sse should not be called again.",
        transport.sessionId
      );
      return;
    }

    const { server, cleanup } = serverFactory();
    // Create and store transport for the new session
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
    const sessionId = req?.query?.sessionId as string | undefined;

    // Get the transport for this session and use it to handle the request
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (transport) {
      console.error("Client Message from", sessionId);
      await transport.handlePostMessage(req, res);
      return;
    }

    res.status(404).json({
      error: `No transport found for sessionId ${sessionId ?? ""}`,
    });
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  console.error("Starting SSE server...");
  const PORT = process.env.PORT || 3001;
  createSseApp().listen(PORT, () => {
    console.error(`Server is running on port ${PORT}`);
  });
}
