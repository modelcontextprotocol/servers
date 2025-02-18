import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { isGiteeError } from "./errors.js";

type MCPServerOptions = {
  name: string;
  version: string;
};

type ToolDefinition = {
  name: string;
  description: string;
  schema: z.ZodType<any, any, any>;
  handler: (params: any) => Promise<any>;
};

export class MCPServer {
  private server: Server;
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(options: MCPServerOptions) {
    this.server = new Server(
      {
        name: options.name,
        version: options.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupRequestHandlers();
  }

  private setupRequestHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const toolsList = Array.from(this.tools.values()).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.schema),
      }));

      return {
        tools: toolsList,
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (!request.params.arguments) {
          throw new Error("Parameters are necessary.");
        }

        const tool = this.tools.get(request.params.name);
        if (!tool) {
          throw new Error(`Unknown tool: ${request.params.name}`);
        }

        const args = tool.schema.parse(request.params.arguments);
        const result = await tool.handler(args);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(`Invalid input: ${JSON.stringify(error.errors)}`);
        }
        if (isGiteeError(error)) {
          throw error;
        }
        throw error;
      }
    });
  }

  public registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  public async connect(transport: StdioServerTransport) {
    await this.server.connect(transport);
  }
}
