import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  SamplingMessage,
  ToolUseContent,
  CreateMessageRequest,
  CreateMessageResult,
  ServerRequest,
  ServerNotification,
  ToolResultContent,
} from "@modelcontextprotocol/sdk/types.js";
import { ToolRegistry, BreakToolLoopError } from "./toolRegistry.js";

export { BreakToolLoopError };

/**
 * Interface for tracking aggregated token usage across API calls.
 */
interface AggregatedUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  api_calls: number;
}

/**
 * Runs a tool loop using sampling.
 * Continues until the LLM provides a final answer.
 */
export async function runToolLoop(
  options: {
    initialMessages: SamplingMessage[];
    server: Server;
    registry: ToolRegistry;
    maxIterations?: number;
    systemPrompt?: string;
    defaultToolChoice?: CreateMessageRequest["params"]["toolChoice"];
  },
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
): Promise<{ answer: string; transcript: SamplingMessage[]; usage: AggregatedUsage }> {
  const messages: SamplingMessage[] = [...options.initialMessages];

  // Initialize usage tracking
  const usage: AggregatedUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    api_calls: 0,
  };

  let iteration = 0;
  const maxIterations = options.maxIterations ?? Number.POSITIVE_INFINITY;
  const defaultToolChoice = options.defaultToolChoice ?? { mode: "auto" };

  let request: CreateMessageRequest["params"] | undefined;
  let response: CreateMessageResult | undefined;

  while (iteration < maxIterations) {
    iteration++;

    // Request message from LLM with available tools
    response = await options.server.createMessage(request = {
      messages,
      systemPrompt: options.systemPrompt,
      maxTokens: 4000,
      tools: iteration < maxIterations ? options.registry.tools : undefined,
      // Don't allow tool calls at the last iteration: finish with an answer no matter what!
      toolChoice: iteration < maxIterations ? defaultToolChoice : { mode: "none" },
    });

    // Aggregate usage statistics from the response
    if (response._meta?.usage) {
      const responseUsage = response._meta.usage as Record<string, number>;
      usage.input_tokens += responseUsage.input_tokens || 0;
      usage.output_tokens += responseUsage.output_tokens || 0;
      usage.cache_creation_input_tokens += responseUsage.cache_creation_input_tokens || 0;
      usage.cache_read_input_tokens += responseUsage.cache_read_input_tokens || 0;
      usage.api_calls += 1;
    }

    // Add assistant's response to message history
    messages.push({
      role: "assistant",
      content: response.content,
    });

    if (response.stopReason === "toolUse") {
      const contentArray = Array.isArray(response.content) ? response.content : [response.content];
      const toolCalls = contentArray.filter(
        (content): content is ToolUseContent => content.type === "tool_use"
      );

      await options.server.sendLoggingMessage({
        level: "info",
        data: `Loop iteration ${iteration}: ${toolCalls.length} tool invocation(s) requested`,
      });

      let toolResults: ToolResultContent[];
      try {
        toolResults = await options.registry.callTools(toolCalls, extra);
      } catch (error) {
        if (error instanceof BreakToolLoopError) {
          return { answer: `${error.message}`, transcript: messages, usage };
        }
        console.error(error);
        throw new Error(`Tool call failed: ${error}`);
      }

      messages.push({
        role: "user",
        content: iteration < maxIterations ? toolResults : [
          ...toolResults,
          {
            type: "text",
            text: "Using the information retrieved from the tools, please now provide a concise final answer to the original question (last iteration of the tool loop).",
          },
        ],
      });
    } else if (response.stopReason === "endTurn") {
      const contentArray = Array.isArray(response.content) ? response.content : [response.content];
      const unexpectedBlocks = contentArray.filter(content => content.type !== "text");
      if (unexpectedBlocks.length > 0) {
        throw new Error(`Expected text content in final answer, but got: ${unexpectedBlocks.map(b => b.type).join(", ")}`);
      }

      await options.server.sendLoggingMessage({
        level: "info",
        data: `Tool loop completed after ${iteration} iteration(s)`,
      });

      return {
        answer: contentArray.map(block => block.type === "text" ? block.text : "").join("\n\n"),
        transcript: messages,
        usage,
      };
    } else if (response?.stopReason === "maxTokens") {
      throw new Error("LLM response hit max tokens limit");
    } else {
      throw new Error(`Unsupported stop reason: ${response.stopReason}`);
    }
  }

  throw new Error(`Tool loop exceeded maximum iterations (${maxIterations}); request: ${JSON.stringify(request)}\nresponse: ${JSON.stringify(response)}`);
}
