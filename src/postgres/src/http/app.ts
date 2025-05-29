import express from "express";
import cors from 'cors';
import { config } from "../config/env.js";
import { createMcpServer } from "../server/server.js";
import { handleMcpRequest, handleMcpDelete, handleMcpGet, closeAllTransports } from "./httpHandler.js";

export function createApp() {
    const app = express();
    const mcpServer = createMcpServer();

    // CORS configuration
    app.use(cors({
        origin: config.server.corsOrigins,
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Accept', 'Mcp-Session-Id'],
        exposedHeaders: ['Mcp-Session-Id'],
        credentials: true,
        maxAge: 86400
    }));

    app.options('/mcp', (req, res) => {
        res.status(200).end();
    });

    app.use(express.json());

    app.use((req, res, next) => {
        if (!req.headers.accept) {
            req.headers.accept = "application/json, text/event-stream";
        }
        next();
    });

    // Route handlers
    app.post("/mcp", (req, res) => handleMcpRequest(mcpServer, req, res));
    app.delete("/mcp", handleMcpDelete);
    app.get("/mcp", handleMcpGet);

    return { app, mcpServer, closeAllTransports };
}
