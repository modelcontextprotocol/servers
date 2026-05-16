/**
 * Agentic Sampling Tool - Demonstrates sampling with tools (MCP 2025-11-25)
 *
 * This tool sends a prompt to the client's LLM with tools available,
 * handles tool_use responses, executes tools locally, and loops
 * until a final text response is received.
 *
 * Flow:
 * 1. Send sampling/createMessage with tools array
 * 2. If stopReason="toolUse", execute tools and continue
 * 3. Repeat until stopReason="endTurn" or iteration limit
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  CreateMessageRequest,
  CreateMessageResultWithToolsSchema,
  Tool,
  ToolUseContent,
  ToolResultContent,
  SamplingMessage,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// ============================================================================
// INPUT SCHEMA
// ============================================================================

const TriggerAgenticSamplingSchema = z.object({
  prompt: z.string().describe("The prompt to send to the LLM"),
  maxTokens: z
    .number()
    .default(1000)
    .describe("Maximum tokens per response"),
  maxIterations: z
    .number()
    .default(5)
    .describe("Maximum tool loop iterations (safety limit)"),
  availableTools: z
    .array(z.string())
    .default(["echo", "add"])
    .describe("Names of server tools to make available to the LLM (default: echo, add)"),
});

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Tool definitions that we expose to the LLM during sampling.
 * These mirror the actual server tools but are executed locally.
 */
const AVAILABLE_TOOL_DEFINITIONS: Record<string, Tool> = {
  echo: {
    name: "echo",
    description: "Echoes back the input message",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to echo" },
      },
      required: ["message"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  add: {
    name: "add",
    description: "Adds two numbers together",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" },
      },
      required: ["a", "b"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
};

// ============================================================================
// LOCAL TOOL EXECUTION
// ============================================================================

/**
 * Execute a tool locally and return the result.
 * These implementations mirror the actual server tools.
 */
async function executeToolLocally(
  toolName: string,
  input: Record<string, unknown>
): Promise<{ result: string; isError: boolean }> {
  try {
    switch (toolName) {
      case "echo":
        return { result: String(input.message), isError: false };

      case "add": {
        const a = Number(input.a);
        const b = Number(input.b);
        if (isNaN(a) || isNaN(b)) {
          return { result: "Error: Both a and b must be numbers", isError: true };
        }
        return { result: String(a + b), isError: false };
      }

      default:
        return { result: `Unknown tool: ${toolName}`, isError: true };
    }
  } catch (error) {
    return {
      result: `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

// ============================================================================
// TOOL CONFIGURATION
// ============================================================================

const name = "trigger-agentic-sampling";
const config = {
  title: "Trigger Agentic Sampling Tool",
  description:
    "Demonstrates sampling with tools - sends a prompt to LLM with tools available, " +
    "handles tool calls in a loop until final response. " +
    "Requires client to support sampling.tools capability.",
  inputSchema: TriggerAgenticSamplingSchema,
};

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Registers the 'trigger-agentic-sampling' tool.
 *
 * Only registered if the client supports sampling.tools capability.
 */
export const registerTriggerAgenticSamplingTool = (server: McpServer) => {
  // Check if client supports sampling with tools
  const clientCapabilities = server.server.getClientCapabilities() || {};
  const samplingCapability = clientCapabilities.sampling;

  // Need sampling.tools capability
  const clientSupportsSamplingWithTools =
    samplingCapability !== undefined &&
    typeof samplingCapability === "object" &&
    samplingCapability !== null &&
    "tools" in samplingCapability;

  // If so, register tool
  if (clientSupportsSamplingWithTools) {
    server.registerTool(name, config, async (args, extra): Promise<CallToolResult> => {
    const validatedArgs = TriggerAgenticSamplingSchema.parse(args);
    const { prompt, maxTokens, maxIterations, availableTools } = validatedArgs;

    // Build tools array from requested tool names
    const tools: Tool[] = availableTools
      .filter((name) => name in AVAILABLE_TOOL_DEFINITIONS)
      .map((name) => AVAILABLE_TOOL_DEFINITIONS[name]);

    if (tools.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Error: No valid tools specified. Available tools: ${Object.keys(AVAILABLE_TOOL_DEFINITIONS).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    console.error(
      `[trigger-agentic-sampling] Starting with prompt: "${prompt.substring(0, 50)}..." ` +
        `(${tools.length} tools, max ${maxIterations} iterations)`
    );

    // Initialize conversation
    let messages: SamplingMessage[] = [
      {
        role: "user",
        content: { type: "text", text: prompt },
      },
    ];

    let iteration = 0;
    let finalResponse = "";
    const toolCallLog: string[] = [];

    // Agentic loop
    while (iteration < maxIterations) {
      iteration++;
      console.error(`[trigger-agentic-sampling] Iteration ${iteration}/${maxIterations}`);

      // Build and send sampling request
      // On last iteration, use toolChoice: none to force final response
      const isLastIteration = iteration >= maxIterations;
      const request: CreateMessageRequest = {
        method: "sampling/createMessage",
        params: {
          messages,
          tools,
          toolChoice: isLastIteration ? { mode: "none" } : { mode: "auto" },
          systemPrompt:
            "You are a helpful assistant with access to tools. " +
            "Use them when needed to answer questions accurately. " +
            "When you have the final answer, respond with just the answer.",
          maxTokens,
          temperature: 0.7,
        },
      };

      // Send the sampling request to the client
      const result = await extra.sendRequest(request, CreateMessageResultWithToolsSchema);

      console.error(`[trigger-agentic-sampling] Got response with stopReason: ${result.stopReason}`);

      // Check if LLM wants to use tools
      if (result.stopReason === "toolUse") {
        // Extract tool_use blocks from content
        const content = Array.isArray(result.content) ? result.content : [result.content];
        const toolUseBlocks = content.filter(
          (block): block is ToolUseContent => block.type === "tool_use"
        );

        if (toolUseBlocks.length === 0) {
          console.error(
            "[trigger-agentic-sampling] stopReason=toolUse but no tool_use blocks found"
          );
          finalResponse = "Error: Received toolUse stop reason but no tool_use blocks";
          break;
        }

        // Add assistant message with full content to history
        // Preserves any reasoning text alongside tool_use blocks for better context
        messages.push({
          role: "assistant",
          content: content,
        });

        // Execute each tool and collect results
        const toolResults: ToolResultContent[] = [];
        for (const toolUse of toolUseBlocks) {
          console.error(
            `[trigger-agentic-sampling] Executing tool: ${toolUse.name}(${JSON.stringify(toolUse.input)})`
          );

          const execResult = await executeToolLocally(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );

          toolCallLog.push(
            `${toolUse.name}(${JSON.stringify(toolUse.input)}) => ${execResult.result}`
          );

          toolResults.push({
            type: "tool_result",
            toolUseId: toolUse.id,
            content: [{ type: "text", text: execResult.result } as TextContent],
            isError: execResult.isError,
          });
        }

        // Add user message with tool_results (MUST only contain tool_results per MCP spec)
        messages.push({
          role: "user",
          content: toolResults,
        });
      } else {
        // Final response (endTurn, maxTokens, stopSequence)
        const content = Array.isArray(result.content) ? result.content : [result.content];
        const textBlock = content.find((block) => block.type === "text");
        finalResponse =
          textBlock?.type === "text"
            ? (textBlock as TextContent).text
            : JSON.stringify(result.content);
        console.error(
          `[trigger-agentic-sampling] Final response received (stopReason: ${result.stopReason})`
        );
        break;
      }
    }

    // Handle iteration limit reached
    if (iteration >= maxIterations && !finalResponse) {
      finalResponse = `[Reached maximum iterations (${maxIterations}) without final response]`;
    }

    // Build response with tool call log
    let responseText = `Agentic sampling completed in ${iteration} iteration(s).\n`;

    if (toolCallLog.length > 0) {
      responseText += `\nTool calls:\n${toolCallLog.map((log) => `  - ${log}`).join("\n")}\n`;
    }

    responseText += `\nFinal response:\n${finalResponse}`;

      return {
        content: [{ type: "text", text: responseText }],
      };
    });
  }
};
