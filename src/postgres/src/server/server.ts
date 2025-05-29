import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerHelloWorldResource } from "../resources/helloWorld.js";
import { registerDatabaseTablesResource } from "../resources/databaseTables.js";
import { registerDatabaseSchemaResource } from "../resources/databaseSchema.js";
import { registerQueryTool } from "../tools/queryTool.js";

export function createMcpServer(): McpServer {
    const mcpServer = new McpServer({
        name: "stateful-server",
        version: "1.0.0",
    });

    // Register resources
    registerHelloWorldResource(mcpServer);
    registerDatabaseTablesResource(mcpServer);
    registerDatabaseSchemaResource(mcpServer);

    // Register tools
    registerQueryTool(mcpServer);

    return mcpServer;
}
