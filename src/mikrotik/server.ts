import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { callToolHandler, listResourcesHandler, readResourceHandler, initializeApi } from "./handlers.js";
import { tools } from "./tools.js";

// Create server instance
const server = new McpServer({
    name: "mikrotik-api",
    version: "1.0.6",
});

const promptsData = [
    { name: "mk-connect: Connect to MikroTik", description: "connect to MikroTik using host, user and password" },
    { name: "mk-report: System Report", description: "show a comprehensive system report" },
    { name: "mk-get-route: Routing Table", description: "print ip/route to show the routing table" },
    { name: "mk-get-interface: List Interfaces", description: "print interface to list all interfaces" },
    { name: "mk-get-log: View Logs", description: "print log to view system logs" },
    { name: "mk-awr: Security Audit", description: "audit router's security and performance" }
];

// Register Prompts
server.registerPrompt("mikrotik-prompts", {
    description: "List available MikroTik prompts"
}, async () => ({
    messages: [
        {
            role: "assistant",
            content: {
                type: "text",
                text: "Available MikroTik prompts:\n" + promptsData.map(p => `- ${p.name}: ${p.description}`).join("\n")
            }
        }
    ]
}));

let lock: Promise<any> = Promise.resolve();

async function executeSequential<T>(fn: () => Promise<T>): Promise<T> {
    const result = (async () => {
        try {
            await lock;
        } catch (e) {
            // Ignore errors from previous commands to let the next one run
        }
        return fn();
    })();
    lock = result.catch(() => { });
    return result;
}

// Register Resource Templates
const ifaceTemplate = new ResourceTemplate("mikrotik://interface/{name}", { 
    list: async () => executeSequential(() => listResourcesHandler({} as any)) 
});
const bridgeTemplate = new ResourceTemplate("mikrotik://bridge/{name}", { 
    list: async () => executeSequential(() => listResourcesHandler({} as any)) 
});
const bridgePortTemplate = new ResourceTemplate("mikrotik://bridge/{bridge}/{port}", { 
    list: async () => executeSequential(() => listResourcesHandler({} as any)) 
});
const routeTemplate = new ResourceTemplate("mikrotik://route/{id}", { 
    list: async () => executeSequential(() => listResourcesHandler({} as any)) 
});

server.registerResource("Interface", ifaceTemplate, { description: "MikroTik interface information" }, async (uri: URL) => {
    return executeSequential(() => readResourceHandler({ params: { uri: uri.toString() } } as any));
});
server.registerResource("Bridge", bridgeTemplate, { description: "MikroTik bridge information" }, async (uri: URL) => {
    return executeSequential(() => readResourceHandler({ params: { uri: uri.toString() } } as any));
});
server.registerResource("Bridge Port", bridgePortTemplate, { description: "MikroTik bridge port information" }, async (uri: URL) => {
    return executeSequential(() => readResourceHandler({ params: { uri: uri.toString() } } as any));
});
server.registerResource("Route", routeTemplate, { description: "MikroTik routing information" }, async (uri: URL) => {
    return executeSequential(() => readResourceHandler({ params: { uri: uri.toString() } } as any));
});

// Register Tools
tools.forEach((tool: any) => {
    // Basic mapping of JSON schema to Zod for simple cases
    let inputSchema: any = z.object({});
    if (tool.inputSchema && tool.inputSchema.properties) {
        const shape: Record<string, any> = {};
        for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
            let field: any = z.any();
            if ((prop as any).type === "string") {
                field = z.string();
            } else if ((prop as any).type === "boolean") {
                field = z.boolean();
            }
            
            if ((prop as any).description) {
                field = field.describe((prop as any).description);
            }
            
            if (tool.inputSchema.required && !(tool.inputSchema.required as string[]).includes(key)) {
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
            return executeSequential(() => callToolHandler({ params: { name: tool.name, arguments: args } } as any));
        }
    );
});

export async function runServer() {
    const args = process.argv.slice(2);
    const host = args[0];
    const secure = args[1] === "true";

    if (host) {
        try {
            await initializeApi(host, undefined, undefined, secure);
        } catch (error) {
            console.error("Failed to connect to MikroTik:", error);
        }
    } else {
        console.error("Warning: No MikroTik host provided. Use mk-connect tool before using other functionality.");
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);

    process.stdin.on("close", () => {
        console.error("Mikrotik MCP Server closed");
        server.close();
        process.exit(0);
    });
}
