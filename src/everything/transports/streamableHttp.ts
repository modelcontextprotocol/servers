import {
  StreamableHTTPServerTransport,
  EventStore,
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { createServer } from "../server/index.js";
import { randomUUID } from "node:crypto";
import cors from "cors";

// Simple in-memory event store for SSE resumability
class InMemoryEventStore implements EventStore {
  private events: Map<string, { streamId: string; message: unknown }> =
    new Map();

  async storeEvent(streamId: string, message: unknown): Promise<string> {
    const eventId = randomUUID();
    this.events.set(eventId, { streamId, message });
    return eventId;
  }

  async replayEventsAfter(
    lastEventId: string,
    { send }: { send: (eventId: string, message: unknown) => Promise<void> }
  ): Promise<string> {
    const entries = Array.from(this.events.entries());
    const startIndex = entries.findIndex(([id]) => id === lastEventId);
    if (startIndex === -1) return lastEventId;

    let lastId: string = lastEventId;
    for (let i = startIndex + 1; i < entries.length; i++) {
      const [eventId, { message }] = entries[i];
      await send(eventId, message);
      lastId = eventId;
    }
    return lastId;
  }
}

console.log("Starting Streamable HTTP server...");

// Express app with permissive CORS for testing with Inspector direct connect mode
const app = express();
app.use(
  cors({
    origin: "*", // use "*" with caution in production
    methods: "GET,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204,
    exposedHeaders: ["mcp-session-id", "last-event-id", "mcp-protocol-version"],
  })
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
            `Transport closed for session ${sid}, removing from transports map`
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
      // Invalid request - no session ID or not initialization request
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
  if (!sessionId || !transports.has(sessionId)) {
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
  if (!sessionId || !transports.has(sessionId)) {
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

  console.log(`Received session termination request for session ${sessionId}`);

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

// Start the server
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.error(`MCP Streamable HTTP Server listening on port ${PORT}`);
});

// Handle server errors
server.on("error", (err: unknown) => {
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

  // Close all active transports to properly clean up resources
  for (const sessionId in transports) {
    try {
      console.log(`Closing transport for session ${sessionId}`);
      await transports.get(sessionId)!.close();
      transports.delete(sessionId);
    } catch (error) {
      console.log(`Error closing transport for session ${sessionId}:`, error);
    }
  }

  console.log("Server shutdown complete");
  process.exit(0);
});
