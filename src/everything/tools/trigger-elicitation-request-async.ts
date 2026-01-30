import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Tool configuration
const name = "trigger-elicitation-request-async";
const config = {
  title: "Trigger Async Elicitation Request Tool",
  description:
    "Trigger an async elicitation request that the CLIENT executes as a background task. " +
    "Demonstrates bidirectional MCP tasks where the server sends an elicitation request and " +
    "the client handles user input asynchronously, allowing the server to poll for completion.",
  inputSchema: {},
};

// Poll interval in milliseconds
const POLL_INTERVAL = 1000;

// Maximum poll attempts before timeout (10 minutes for user input)
const MAX_POLL_ATTEMPTS = 600;

/**
 * Registers the 'trigger-elicitation-request-async' tool.
 *
 * This tool demonstrates bidirectional MCP tasks for elicitation:
 * - Server sends elicitation request to client with task metadata
 * - Client creates a task and returns CreateTaskResult
 * - Client prompts user for input (task status: input_required)
 * - Server polls client's tasks/get endpoint for status
 * - Server fetches final result from client's tasks/result endpoint
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerElicitationRequestAsyncTool = (
  server: McpServer
) => {
  // Check client capabilities
  const clientCapabilities = server.server.getClientCapabilities() || {};

  // Client must support elicitation AND tasks.requests.elicitation
  const clientSupportsElicitation =
    clientCapabilities.elicitation !== undefined;
  const clientTasksCapability = clientCapabilities.tasks as
    | {
        requests?: { elicitation?: { create?: object } };
      }
    | undefined;
  const clientSupportsAsyncElicitation =
    clientTasksCapability?.requests?.elicitation?.create !== undefined;

  if (clientSupportsElicitation && clientSupportsAsyncElicitation) {
    server.registerTool(
      name,
      config,
      async (args, extra): Promise<CallToolResult> => {
        // Create the elicitation request WITH task metadata
        // Using z.any() schema to avoid complex type matching with _meta
        const request = {
          method: "elicitation/create" as const,
          params: {
            task: {
              ttl: 600000, // 10 minutes (user input may take a while)
            },
            message:
              "Please provide inputs for the following fields (async task demo):",
            requestedSchema: {
              type: "object" as const,
              properties: {
                name: {
                  title: "Your Name",
                  type: "string" as const,
                  description: "Your full name",
                },
                favoriteColor: {
                  title: "Favorite Color",
                  type: "string" as const,
                  description: "What is your favorite color?",
                  enum: ["Red", "Blue", "Green", "Yellow", "Purple"],
                },
                agreeToTerms: {
                  title: "Terms Agreement",
                  type: "boolean" as const,
                  description: "Do you agree to the terms and conditions?",
                },
              },
              required: ["name"],
            },
          },
        };

        // Send the elicitation request
        // Client may return either:
        // - ElicitResult (synchronous execution)
        // - CreateTaskResult (task-based execution with { task } object)
        const elicitResponse = await extra.sendRequest(
          request as Parameters<typeof extra.sendRequest>[0],
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
            // ElicitResult - synchronous execution
            z.object({
              action: z.string(),
              content: z.any().optional(),
            }),
          ])
        );

        // Check if client returned CreateTaskResult (has task object)
        const isTaskResult = "task" in elicitResponse && elicitResponse.task;
        if (!isTaskResult) {
          // Client executed synchronously - return the direct response
          return {
            content: [
              {
                type: "text",
                text: `[SYNC] Client executed synchronously:\n${JSON.stringify(
                  elicitResponse,
                  null,
                  2
                )}`,
              },
            ],
          };
        }

        const taskId = elicitResponse.task.taskId;
        const statusMessages: string[] = [];
        statusMessages.push(`Task created: ${taskId}`);

        // Poll for task completion
        let attempts = 0;
        let taskStatus = elicitResponse.task.status;
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

          // Only log status changes or every 10 polls to avoid spam
          if (
            attempts === 1 ||
            attempts % 10 === 0 ||
            taskStatus !== "input_required"
          ) {
            statusMessages.push(
              `Poll ${attempts}: ${taskStatus}${
                taskStatusMessage ? ` - ${taskStatusMessage}` : ""
              }`
            );
          }
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

        // Format the elicitation result
        const content: CallToolResult["content"] = [];

        if (result.action === "accept" && result.content) {
          content.push({
            type: "text",
            text: `[COMPLETED] User provided the requested information!`,
          });

          const userData = result.content as Record<string, unknown>;
          const lines = [];
          if (userData.name) lines.push(`- Name: ${userData.name}`);
          if (userData.favoriteColor)
            lines.push(`- Favorite Color: ${userData.favoriteColor}`);
          if (userData.agreeToTerms !== undefined)
            lines.push(`- Agreed to terms: ${userData.agreeToTerms}`);

          content.push({
            type: "text",
            text: `User inputs:\n${lines.join("\n")}`,
          });
        } else if (result.action === "decline") {
          content.push({
            type: "text",
            text: `[DECLINED] User declined to provide the requested information.`,
          });
        } else if (result.action === "cancel") {
          content.push({
            type: "text",
            text: `[CANCELLED] User cancelled the elicitation dialog.`,
          });
        }

        // Include progress and raw result for debugging
        content.push({
          type: "text",
          text: `\nProgress:\n${statusMessages.join(
            "\n"
          )}\n\nRaw result: ${JSON.stringify(result, null, 2)}`,
        });

        return { content };
      }
    );
  }
};
