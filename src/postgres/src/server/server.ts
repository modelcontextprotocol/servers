import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerHelloWorldResource } from "../resources/helloWorld.js";

export function createMcpServer(): McpServer {
    const mcpServer = new McpServer({
        name: "stateful-server",
        version: "1.0.0",
    });

    // Register resources
    registerHelloWorldResource(mcpServer);

    // Register tools

    return mcpServer;
}
