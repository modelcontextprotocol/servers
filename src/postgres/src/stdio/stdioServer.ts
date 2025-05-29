import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../server/server.js";

export async function runStdioServer() {
    const server = createMcpServer();
    const transport = new StdioServerTransport();

    console.error("Starting MCP stdio server...");
    await server.connect(transport);
    console.error("MCP stdio server started successfully");

    let isShuttingDown = false;

    const shutdown = async () => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log("Gracefully shutting down MCP stdio server...");
        try {
            await transport.close();
        } catch (error) {
            console.error("Error closing transport:", error);
        }

        console.log("MCP stdio server shut down completed.");
        process.exit(0);
    };

    // Handle termination signals
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    process.on("uncaughtException", (err) => {
        console.error("Uncaught exception:", err);
        shutdown();
    });

    process.on("unhandledRejection", (reason, promise) => {
        console.error("Unhandled Rejection at:", promise, "reason:", reason);
        shutdown();
    });

}

export async function startStdioServer() {
    try {
        await runStdioServer();
    } catch (error) {
        console.error("Failed to start stdio server:", error);
        process.exit(1);
    }
}
