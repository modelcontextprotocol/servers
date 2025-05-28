import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  isInitializeRequest
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import express from "express";
import dotenv from 'dotenv';

dotenv.config();

const server = new Server(
  {
    name: "example-servers/postgres",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

// List available resources when clients request them
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  console.log("Handling resources/list request");
  return {
    resources: [
      {
        uri: "hello://world",
        name: "Hello World Message",
        description: "A simple greeting message",
        mimeType: "text/plain",
      },
    ],
  };
});

// Return resource content when clients request it
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  console.log("Handling resources/read request for:", request.params.uri);
  if (request.params.uri === "hello://world") {
    return {
      contents: [
        {
          uri: "hello://world",
          text: "Hello, World! This is my first MCP resource.",
        },
      ],
    };
  }
  throw new Error("Resource not found");
});

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// async function runServer() {
const app = express();
app.use(express.json());

// Handle all MCP requests (POST) at /mcp endpoint
app.post('/mcp', async (req, res) => {
  try {
    console.log("Received POST request:", JSON.stringify(req.body, null, 2));
    console.log("Headers:", req.headers);

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      console.log("Using existing transport for session:", sessionId);
      transport = transports[sessionId];
    } else if (isInitializeRequest(req.body)) {
      // New initialization request
      console.log("Creating new transport for initialization");
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          transports[sessionId] = transport;
          console.log("Session initialized:", sessionId);
        },
      });

      // Clean up transport when closed
      transport.onclose = () => {
        console.log("Transport closed for session:", transport.sessionId);
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };

      // Connect the server to the transport
      await server.connect(transport);
      console.log("Server connected to transport");
    } else {
      // Invalid request - missing session ID for non-initialize request
      console.log("Invalid request: missing session ID or not an initialize request");
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided and not an initialize request',
        },
        id: req.body.id || null,
      });
      return;
    }

    // Handle the request
    console.log("Handling request through transport");
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling POST request:", error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error: ' + (error instanceof Error ? error.message : String(error)),
      },
      id: req.body?.id || null,
    });
  }
});

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    console.log("GET request for session:", sessionId);

    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling GET request:", error);
    res.status(500).send('Internal server error');
  }
});

// Handle DELETE requests for session termination
app.delete('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    console.log("DELETE request for session:", sessionId);

    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);

    // Clean up the transport
    delete transports[sessionId];
  } catch (error) {
    console.error("Error handling DELETE request:", error);
    res.status(500).send('Internal server error');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`MCP server running on http://localhost:${port}/mcp`);
});

// runServer().catch(console.error);
