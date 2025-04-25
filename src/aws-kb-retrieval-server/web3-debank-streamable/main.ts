// debank.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import express, { Request, Response, NextFunction } from "npm:express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk";
import toolsList from "./tool/toolInfo.ts";
import { toolToHandler } from "./tool/toolHandler.ts";

// Server configuration
const APP_NAME = "debank";
const APP_VERSION = "1.0.0";
const PORT = 8080;

// Create MCP server
function createServer() {
  const server = new Server(
    {
      name: APP_NAME,
      version: APP_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, () => {
    console.log("Handling listTools request");
    return {
      tools: toolsList,
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    console.log(`Handling callTool request for tool: ${request.params.name}`);
    try {
      const requestToolName = request.params.name;

      const isMcptool = toolsList.some(
        (tool) => tool.name === requestToolName,
      );

      if (isMcptool) {
        const tool = toolsList.find((tool) => tool.name === requestToolName);
        if (!tool) {
          console.log(`Tool ${requestToolName} not found`);
          return { error: `Tool ${requestToolName} not found` };
        }

        const handler = toolToHandler[requestToolName];

        if (!handler) {
          console.log(`Handler for ${requestToolName} not found`);
          return { error: `Handler for ${requestToolName} not found` };
        }

        console.log(`Calling handler for ${requestToolName}`);
        const result = await handler(request.params.arguments as any);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      }
      console.log(`Tool ${requestToolName} not found in toolsList`);
      return {
        content: [
          {
            type: "text",
            text: "Tool not found",
          },
        ],
      };
    } catch (error) {
      console.error(`Error calling tool: ${error}`);
      return {
        content: [
          {
            type: "text",
            text: `Tool ${request.params.name} failed: ${error}`,
          },
        ],
      };
    }
  });

  return server;
}

// Start server
const startServer = async () => {
  const app = express();
  app.use(express.json());

  // Logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.url}`);
    console.log('Headers:', JSON.stringify(req.headers));
    if (req.body) {
      console.log('Body:', JSON.stringify(req.body));
    }
    next();
  });

  // Single endpoint to handle all MCP requests - stateless mode
  app.all('/mcp', async (req: Request, res: Response) => {
    console.log(`Received ${req.method} request to /mcp`);

    try {
      // Create new server instance and transport for each request
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      // Connect to server
      await server.connect(transport);

      // Handle request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  const server = app.listen(PORT, () => {
    console.log(`DeBanK MCP Server listening on port ${PORT}`);
  });

  // Handle server shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
      console.log('Server shutdown complete');
      process.exit(0);
    });
  });
};

// Start server
startServer();