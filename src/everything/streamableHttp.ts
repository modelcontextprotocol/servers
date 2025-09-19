import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import express, { Request, Response } from "express";
import { createServer } from "./everything.js";
import { randomUUID } from 'node:crypto';
import cors from 'cors';

console.error('Starting Streamable HTTP server...');

const app = express();
app.use(cors({
    "origin": "*", // use "*" with caution in production
    "methods": "GET,POST,DELETE",
    "preflightContinue": false,
    "optionsSuccessStatus": 204,
    "exposedHeaders": [
        'mcp-session-id',
        'last-event-id',
        'mcp-protocol-version'
    ]
})); // Enable CORS for all routes so Inspector can connect

const transports: Map<string, StreamableHTTPServerTransport> = new Map<string, StreamableHTTPServerTransport>();

app.post('/mcp', async (req: Request, res: Response) => {
  console.error('Received MCP POST request');
  try {
    // Check for existing session ID
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport
      transport = transports.get(sessionId)!;
    } else if (!sessionId) {

      const { server, cleanup, startNotificationIntervals } = createServer();

      // New initialization request
      const eventStore = new InMemoryEventStore();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        eventStore, // Enable resumability
        onsessioninitialized: (sessionId: string) => {
          // Store the transport by session ID when session is initialized
          // This avoids race conditions where requests might come in before the session is stored
          console.error(`Session initialized with ID: ${sessionId}`);
          transports.set(sessionId, transport);
        }
      });


      // Set up onclose handler to clean up transport when closed
      server.onclose = async () => {
        const sid = transport.sessionId;
        if (sid && transports.has(sid)) {
          console.error(`Transport closed for session ${sid}, removing from transports map`);
          transports.delete(sid);
          await cleanup();
        }
      };

      // Connect the transport to the MCP server BEFORE handling the request
      // so responses can flow back through the same transport
      await server.connect(transport);

      await transport.handleRequest(req, res);

      // Wait until initialize is complete and transport will have a sessionId
      startNotificationIntervals(transport.sessionId);

        return; // Already handled
    } else {
      // Invalid request - no session ID or not initialization request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: req?.body?.id,
      });
      return;
    }

    // Handle the request with existing transport - no need to reconnect
    // The existing transport is already connected to the server
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: req?.body?.id,
      });
      return;
    }
  }
});

// Handle GET requests for SSE streams (using built-in support from StreamableHTTP)
app.get('/mcp', async (req: Request, res: Response) => {
  console.error('Received MCP GET request');
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: req?.body?.id,
    });
    return;
  }

  // Check for Last-Event-ID header for resumability
  const lastEventId = req.headers['last-event-id'] as string | undefined;
  if (lastEventId) {
    console.error(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
  } else {
    console.error(`Establishing new SSE stream for session ${sessionId}`);
  }

  const transport = transports.get(sessionId);
  await transport!.handleRequest(req, res);
});

// Handle DELETE requests for session termination (according to MCP spec)
app.delete('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: req?.body?.id,
    });
    return;
  }

  console.error(`Received session termination request for session ${sessionId}`);

  try {
    const transport = transports.get(sessionId);
    await transport!.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling session termination:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Error handling session termination',
        },
        id: req?.body?.id,
      });
      return;
    }
  }
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.error(`MCP Streamable HTTP Server listening on port ${PORT}`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
  console.error('Shutting down server...');

  // Close all active transports to properly clean up resources
  for (const sessionId in transports) {
    try {
      console.error(`Closing transport for session ${sessionId}`);
      await transports.get(sessionId)!.close();
      transports.delete(sessionId);
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }

  console.error('Server shutdown complete');
  process.exit(0);
});
