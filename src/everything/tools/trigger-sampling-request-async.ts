import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  CreateMessageRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Tool input schema
const TriggerSamplingRequestAsyncSchema = z.object({
  prompt: z.string().describe("The prompt to send to the LLM"),
  maxTokens: z
    .number()
    .default(100)
    .describe("Maximum number of tokens to generate"),
});

// Tool configuration
const name = "trigger-sampling-request-async";
const config = {
  title: "Trigger Async Sampling Request Tool",
  description:
    "Trigger an async sampling request that the CLIENT executes as a background task. " +
    "Demonstrates bidirectional MCP tasks where the server sends a request and the client " +
    "executes it asynchronously, allowing the server to poll for progress and results.",
  inputSchema: TriggerSamplingRequestAsyncSchema,
};

// Poll interval in milliseconds
const POLL_INTERVAL = 1000;

// Maximum poll attempts before timeout
const MAX_POLL_ATTEMPTS = 60;

/**
 * Registers the 'trigger-sampling-request-async' tool.
 *
 * This tool demonstrates bidirectional MCP tasks:
 * - Server sends sampling request to client with task metadata
 * - Client creates a task and returns CreateTaskResult
 * - Server polls client's tasks/get endpoint for status
 * - Server fetches final result from client's tasks/result endpoint
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerSamplingRequestAsyncTool = (server: McpServer) => {
  // Check client capabilities
  const clientCapabilities = server.server.getClientCapabilities() || {};

  // Client must support sampling AND tasks.requests.sampling
  const clientSupportsSampling = clientCapabilities.sampling !== undefined;
  const clientTasksCapability = clientCapabilities.tasks as
    | {
        requests?: { sampling?: { createMessage?: object } };
      }
    | undefined;
  const clientSupportsAsyncSampling =
    clientTasksCapability?.requests?.sampling?.createMessage !== undefined;

  if (clientSupportsSampling && clientSupportsAsyncSampling) {
    server.registerTool(
      name,
      config,
      async (args, extra): Promise<CallToolResult> => {
        const validatedArgs = TriggerSamplingRequestAsyncSchema.parse(args);
        const { prompt, maxTokens } = validatedArgs;

        // Create the sampling request WITH task metadata
        // The params.task field signals to the client that this should be executed as a task
        const request: CreateMessageRequest & {
          params: { task?: { ttl: number } };
        } = {
          method: "sampling/createMessage",
          params: {
            task: {
              ttl: 300000, // 5 minutes
            },
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Resource ${name} context: ${prompt}`,
                },
              },
            ],
            systemPrompt: "You are a helpful test server.",
            maxTokens,
            temperature: 0.7,
          },
        };

        // Send the sampling request
        // Client may return either:
        // - CreateMessageResult (synchronous execution)
        // - CreateTaskResult (task-based execution with { task } object)
        const samplingResponse = await extra.sendRequest(
          request,
          z.union([
            // CreateTaskResult - client created a task
            z.object({
              task: z.object({
                taskId: z.string(),
                status: z.string(),
                pollInterval: z.number().optional(),
                statusMessage: z.string().optional(),
              }),
            }),
            // CreateMessageResult - synchronous execution
            z.object({
              role: z.string(),
              content: z.any(),
              model: z.string(),
              stopReason: z.string().optional(),
            }),
          ])
        );

        // Check if client returned CreateTaskResult (has task object)
        const isTaskResult =
          "task" in samplingResponse && samplingResponse.task;
        if (!isTaskResult) {
          // Client executed synchronously - return the direct response
          return {
            content: [
              {
                type: "text",
                text: `[SYNC] Client executed synchronously:\n${JSON.stringify(
                  samplingResponse,
                  null,
                  2
                )}`,
              },
            ],
          };
        }

        const taskId = samplingResponse.task.taskId;
        const statusMessages: string[] = [];
        statusMessages.push(`Task created: ${taskId}`);

        // Poll for task completion
        let attempts = 0;
        let taskStatus = samplingResponse.task.status;
        let taskStatusMessage: string | undefined;

        while (
          taskStatus !== "completed" &&
          taskStatus !== "failed" &&
          taskStatus !== "cancelled" &&
          attempts < MAX_POLL_ATTEMPTS
        ) {
          // Wait before polling
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
          attempts++;

          // Get task status from client
          const pollResult = await extra.sendRequest(
            {
              method: "tasks/get",
              params: { taskId },
            },
            z
              .object({
                status: z.string(),
                statusMessage: z.string().optional(),
              })
              .passthrough()
          );

          taskStatus = pollResult.status;
          taskStatusMessage = pollResult.statusMessage;
          statusMessages.push(
            `Poll ${attempts}: ${taskStatus}${
              taskStatusMessage ? ` - ${taskStatusMessage}` : ""
            }`
          );
        }

        // Check for timeout
        if (attempts >= MAX_POLL_ATTEMPTS) {
          return {
            content: [
              {
                type: "text",
                text: `[TIMEOUT] Task timed out after ${MAX_POLL_ATTEMPTS} poll attempts\n\nProgress:\n${statusMessages.join(
                  "\n"
                )}`,
              },
            ],
          };
        }

        // Check for failure/cancellation
        if (taskStatus === "failed" || taskStatus === "cancelled") {
          return {
            content: [
              {
                type: "text",
                text: `[${taskStatus.toUpperCase()}] ${
                  taskStatusMessage || "No message"
                }\n\nProgress:\n${statusMessages.join("\n")}`,
              },
            ],
          };
        }

        // Fetch the final result
        const result = await extra.sendRequest(
          {
            method: "tasks/result",
            params: { taskId },
          },
          z.any()
        );

        // Return the result with status history
        return {
          content: [
            {
              type: "text",
              text: `[COMPLETED] Async sampling completed!\n\n**Progress:**\n${statusMessages.join(
                "\n"
              )}\n\n**Result:**\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }
    );
  }
};
