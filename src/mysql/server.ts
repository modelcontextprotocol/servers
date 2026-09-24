import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initializePool } from "./db.js";
import { listResourcesHandler, readResourceHandler, callToolHandler } from "./handlers.js";
import { tools } from "./tools.js";

// Create server instance
const server = new McpServer({
    name: "mysql-server",
    version: "1.0.7",
});

const prompts = [
    { name: "mysql-query: Execute Query", description: "mysql-query select * from test_users" },
    { name: "mysql-explain: Explain Query", description: "mysql-explain select * from test_users" },
    { name: "mysql-stats: Table Statistics", description: "mysql-stats test_users" },
    { name: "mysql-connect: Database Connection", description: "mysql-connect to MySQL using a string like host.docker.internal:3306/dbname user name and password" },
    { name: "mysql-awr: Performance Report", description: "mysql-awr for MySQL performance report similar to Oracle AWR" }
];

// Register Prompts
server.registerPrompt("mysql-prompts", {
    description: "List available MySQL prompts"
}, async () => ({
    messages: [
        {
            role: "assistant",
            content: {
                type: "text",
                text: "Available MySQL prompts:\n" + prompts.map(p => `- ${p.name}: ${p.description}`).join("\n")
            }
        }
    ]
}));

// Register Resource Templates
const resourceTemplate = new ResourceTemplate("mysql://{database}/{table_name}/schema", { 
    list: async () => listResourcesHandler({} as any) 
});
server.registerResource(
    "Table Schema",
    resourceTemplate,
    { description: "Schema information for a MySQL database table including column names and data types" },
    async (uri) => {
        return readResourceHandler({ params: { uri: uri.href } } as any);
    }
);

// Register Tools
tools.forEach(tool => {
    // Basic mapping of JSON schema to Zod for simple cases
    let inputSchema: any = z.object({});
    if (tool.inputSchema && tool.inputSchema.properties) {
        const shape: Record<string, any> = {};
        for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
            let field: any = z.any();
            if ((prop as any).type === "string") {
                field = z.string();
            }
            if ((prop as any).description) {
                field = field.describe((prop as any).description);
            }
            if (tool.inputSchema.required && !tool.inputSchema.required.includes(key)) {
                field = field.optional();
            } else if (!tool.inputSchema.required) {
                field = field.optional();
            }
            shape[key] = field;
        }
        inputSchema = z.object(shape);
    }

    server.registerTool(
        tool.name,
        {
            description: tool.description,
            inputSchema: inputSchema
        },
        async (args: any) => {
            return callToolHandler({ params: { name: tool.name, arguments: args } } as any);
        }
    );
});

export async function runServer() {
    const args = process.argv.slice(2);
    const databaseUrl = args[0];

    if (databaseUrl) {
        try {
            await initializePool(databaseUrl);
        } catch (error) {
            console.error("Failed to initialize database pool:", error);
            process.exit(1);
        }
    } else {
        console.error("Warning: No database URL provided. Use mysql-connect tool before using other functionality.");
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);

    process.stdin.on("close", () => {
        console.error("MySQL MCP Server closed");
        server.close();
        process.exit(0);
    });
}
