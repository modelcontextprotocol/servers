import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  Tool,
  ToolAnnotations,
  ToolUseContent,
  ToolResultContent,
  CallToolResult,
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";

export class BreakToolLoopError extends Error {
  constructor(message: string) {
    super(message);
  }
}

type ToolCallback = (
  args: Record<string, unknown>,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
) => CallToolResult | Promise<CallToolResult>;

interface ToolDefinition {
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: ToolAnnotations;
  _meta?: Record<string, unknown>;
  callback: ToolCallback;
}

export class ToolRegistry {
  readonly tools: Tool[];

  constructor(private toolDefinitions: { [name: string]: ToolDefinition }) {
    this.tools = Object.entries(this.toolDefinitions).map(([name, tool]) => (<Tool>{
      name,
      title: tool.title,
      description: tool.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: tool.inputSchema ? zodToJsonSchema(tool.inputSchema as any) : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      outputSchema: tool.outputSchema ? zodToJsonSchema(tool.outputSchema as any) : undefined,
      annotations: tool.annotations,
      _meta: tool._meta,
    }));
  }

  async callTools(
    toolCalls: ToolUseContent[],
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>
  ): Promise<ToolResultContent[]> {
    return Promise.all(toolCalls.map(async ({ name, id, input }) => {
      const tool = this.toolDefinitions[name];
      if (!tool) {
        throw new Error(`Tool ${name} not found`);
      }
      try {
        return <ToolResultContent>{
          type: "tool_result",
          toolUseId: id,
          // Copies fields: content, structuredContent?, isError?
          ...await tool.callback(input as Record<string, unknown>, extra),
        };
      } catch (error) {
        if (error instanceof BreakToolLoopError) {
          throw error;
        }
        throw new Error(`Tool ${name} failed: ${error instanceof Error ? `${error.message}\n${error.stack}` : error}`);
      }
    }));
  }
}
