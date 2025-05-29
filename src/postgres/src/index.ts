import { config } from "./config/env.js";
import { createApp } from "./http/app.js";

const { app, mcpServer, closeAllTransports } = createApp();

app.listen(config.server.port, config.server.host, () => {
    console.log(`Stateful server is running on http://${config.server.host}:${config.server.port}/mcp`);
    if (process.env.NODE_ENV !== 'production') {
        console.log(`Local access: http://localhost:${config.server.port}/mcp`);
    }
});

// Graceful shutdown handler
const shutdown = async () => {
    console.log("Shutting down server...");
    try {
        await closeAllTransports();
    } catch (error) {
        console.error(`Error closing transports:`, error);
    }

    await mcpServer.close();
    console.log("Server shutdown complete");
    process.exit(0);
};

// Handle SIGINT and SIGTERM
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
