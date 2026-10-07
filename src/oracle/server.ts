import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initializePool } from "./db.js";
import { listResourcesHandler, readResourceHandler, callToolHandler } from "./handlers.js";
import { tools } from "./tools.js";

// Create server instance
const server = new McpServer({
    name: "oracle-server",
    version: "1.0.7",
});

const prompts = [
  { name: "orcl-query: Execute Query", description: "orcl-query select * from COUNTRIES" },
  { name: "orcl-explain: Explain Query", description: "orcl-explain select * from COUNTRIES" },
  { name: "orcl-stats: Table Statistics", description: "orcl-stats COUNTRIES" },
  { name: "orcl-connect: Database Connection", description: "orcl-connect to Oracle using an string like host.docker.internal:1521/freepdb1 user name and password" },
  { name: "orcl-awr: Performance Report", description: "orcl-awr with optional sql_id, requires SELECT_CATALOG_ROLE and grant execute on DBMS_WORKLOAD_REPOSITORY package" }
];

// Register Prompts
server.registerPrompt("orcl-prompts", {
    description: "List available Oracle prompts"
}, async () => ({
    messages: [
        {
            role: "assistant",
            content: {
                type: "text",
                text: "Available Oracle prompts:\n" + prompts.map(p => `- ${p.name}: ${p.description}`).join("\n")
            }
        }
    ]
}));

// Register Resource Templates
const resourceTemplate = new ResourceTemplate("oracle://{user}/{table_name}/schema", { 
    list: async () => listResourcesHandler({} as any) 
});
server.registerResource(
    "Table Schema",
    resourceTemplate,
    { description: "Schema information for an Oracle database table including column names and data types" },
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
  const connectionString = args[0];

  if (connectionString) {
    if (!process.env.ORACLE_USER) {
      console.error("Error: Environment variable ORACLE_USER must be set.");
      process.exit(1);
    }
    await initializePool(connectionString); // Initialize the pool before starting the server
  } else {
    console.error("Warning: No Oracle connection string provided. Use orcl-connect tool before using other functionality.");
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stdin.on("close", () => {
    console.error("Oracle MCP Server closed");
    server.close();
    process.exit(0);
  });
}
