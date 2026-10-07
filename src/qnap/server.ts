import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { tools } from "./tools.js";
import { callToolHandler, listResourcesHandler, readResourceHandler, initializeApi } from "./handlers.js";

const server = new McpServer({
    name: "qnap-mcp-server",
    version: "1.0.8",
});

const promptsData = [
    { name: "qnap-connect: Connect to QNAP NAS", description: "connect to QNAP NAS using host, username and password" },
    { name: "qnap-report: System Report", description: "show a comprehensive system report with CPU, memory, and disk status" },
    { name: "qnap-dir: List Directory", description: "list contents of a directory on the QNAP NAS" },
    { name: "qnap-file-info: File Information", description: "get detailed information about a specific file" }
];

// Register Prompts
server.registerPrompt("qnap-prompts", {
    description: "List available QNAP prompts"
}, async () => ({
    messages: [
        {
            role: "assistant",
            content: {
                type: "text",
                text: "Available QNAP prompts:\n" + promptsData.map(p => `- ${p.name}: ${p.description}`).join("\n")
            }
        }
    ]
}));

// Register Resource Templates
const diskTemplate = new ResourceTemplate("qnap://{host}/disk/{id}", { 
    list: async () => listResourcesHandler({} as any) 
});
const volumeTemplate = new ResourceTemplate("qnap://{host}/volume/{id}", { 
    list: async () => listResourcesHandler({} as any) 
});

server.registerResource(
    "Disk Info",
    diskTemplate,
    { description: "Information about a specific disk on the QNAP NAS" },
    async (uri: URL) => {
        return readResourceHandler({ params: { uri: uri.toString() } } as any);
    }
);

server.registerResource(
    "Volume Info",
    volumeTemplate,
    { description: "Information about a specific volume on the QNAP NAS" },
    async (uri: URL) => {
        return readResourceHandler({ params: { uri: uri.toString() } } as any);
    }
);

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
            return callToolHandler({ params: { name: tool.name, arguments: args } } as any);
        }
    );
});

export class QnapServer {
    async run() {
        const args = process.argv.slice(2);
        const host = args[0];

        if (host) {
            try {
                await initializeApi(host);
                console.error(`Automatically connected to QNAP NAS at ${host}`);
            } catch (error: any) {
                console.error(`Failed to automatically connect to QNAP NAS: ${error.message}`);
            }
        } else {
            console.error("Warning: No QNAP host provided as argument. Use qnap-connect tool before using other functionality.");
        }

        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("QNAP MCP server running on stdio");

        process.stdin.on("close", () => {
            console.error("QNAP MCP Server closed");
            server.close();
            process.exit(0);
        });
    }
}
