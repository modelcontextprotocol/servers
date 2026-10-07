import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initializePool } from "./db.js";
import { listResourcesHandler, readResourceHandler, callToolHandler } from "./handlers.js";
import { tools } from "./tools.js";

// Create server instance
const server = new McpServer({
    name: "postgres-server",
    version: "1.0.8",
});

const prompts = [
    { name: "pg-query: Execute Query", description: "pg-query select * from test" },
    { name: "pg-explain: Explain Query", description: "pg-explain select * from test" },
    { name: "pg-stats: Table Statistics", description: "pg-stats test" },
    { name: "pg-connect: Database Connection", description: "pg-connect to PostgreSQL using a connection string like host.docker.internal:5432/dbname with user name and password" },
    { name: "pg-awr: Performance Report", description: "pg-awr to generate a PostgreSQL performance report (requires pg_stat_statements extension)" }
];

// Register Prompts
server.registerPrompt("postgres-prompts", {
    description: "List available Postgres prompts"
}, async () => ({
    messages: [
        {
            role: "assistant",
            content: {
                type: "text",
                text: "Available Postgres prompts:\n" + prompts.map(p => `- ${p.name}: ${p.description}`).join("\n")
            }
        }
    ]
}));

// Register Resource Templates
const resourceTemplate = new ResourceTemplate("postgres://{schema}/{table}/schema", { 
    list: async () => listResourcesHandler({} as any) 
});
server.registerResource(
    "Table Schema",
    resourceTemplate,
    { description: "Schema information for a PostgreSQL database table including column names and data types" },
    async (uri) => {
        return readResourceHandler({ params: { uri: uri.toString() } } as any);
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
        console.error("Warning: No database URL provided. Use pg-connect tool before using other functionality.");
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);

    process.stdin.on("close", () => {
        console.error("Postgres MCP Server closed");
        server.close();
        process.exit(0);
    });
}
