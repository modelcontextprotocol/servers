import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../server/server.js";

export async function runStdioServer() {
    const server = createMcpServer();
    const transport = new StdioServerTransport();

    console.error("Starting MCP stdio server...");
    await server.connect(transport);
    console.error("MCP stdio server started successfully");
}

export async function startStdioServer() {
    try {
        await runStdioServer();
    } catch (error) {
        console.error("Failed to start stdio server:", error);
        process.exit(1);
    }
}
