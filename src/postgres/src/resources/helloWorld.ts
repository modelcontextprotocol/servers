import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerHelloWorldResource(mcpServer: McpServer) {
    mcpServer.resource("Hello World Message", "hello://world", {
        description: "A simple greeting message",
        mimeType: "text/plain",
    }, async () => ({
        contents: [
            {
                uri: "hello://world",
                text: "A simple greeting message",
            },
        ],
    }));
}
