// src/http/httpHandler.ts
import { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

export async function handleMcpRequest(mcpServer: McpServer, req: Request, res: Response) {
    try {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
            transport = transports[sessionId];
        } else if (
            ((isInitializeRequest(req.body) || req.body.method === 'initialize') &&
                !sessionId) || req.body.method === 'server/info'
        ) {
            console.log('Initializing new session for request:', req.body);

            const eventStore = new InMemoryEventStore();

            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                eventStore,
                onsessioninitialized: (sessionId) => {
                    console.log(`Session initialized with ID: ${sessionId}`);
                    transports[sessionId] = transport;
                },
            });

            transport.onclose = () => {
                const sid = transport.sessionId;
                if (sid && transports[sid]) {
                    console.log(`Transport closed for session ID: ${sid}`);
                    delete transports[sid];
                }
            };

            await mcpServer.connect(transport);
            await transport.handleRequest(req, res, req.body);
            return;
        } else {
            res.status(400).json({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Bad Request: No valid session ID provided",
                },
                id: null,
            });
            return;
        }

        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: "2.0",
                error: {
                    code: -32603,
                    message: "Internal server error",
                },
                id: null,
            });
        }
    }
}

export async function handleMcpDelete(req: Request, res: Response) {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !transports[sessionId]) {
        res
            .status(400)
            .send("Invalid or missing session ID. Please provide a valid session ID.");
        return;
    }

    console.log(`Closing session for ID: ${sessionId}`);
    try {
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
    } catch (error) {
        console.error("Error closing transport:", error);
        if (!res.headersSent) {
            res.status(500).send("Error closing transport");
        }
    }
}

export async function handleMcpGet(req: Request, res: Response) {
    console.log("Received GET MCP request");
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: "2.0",
            error: {
                code: -32000,
                message: "Method not allowed.",
            },
            id: null,
        })
    );
}

export async function closeAllTransports() {
    for (const sessionId in transports) {
        const transport = transports[sessionId];
        if (transport) {
            await transport.close();
            console.log(`Transport closed for session ID: ${sessionId}`);
        }
    }
}
