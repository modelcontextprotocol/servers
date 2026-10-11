// The `trigger-sampling-request-async` tool: a task on the Tasks extension
// (`io.modelcontextprotocol/tasks`) that needs an LLM completion from the
// client before it can finish, on protocol version 2026-07-28 (#4852).
//
// On 2025-11-25 this tool sent the client a task-augmented
// `sampling/createMessage` request and polled the client's own task. The
// 2026-07-28 revision has no server-to-client requests, so the roles turn
// around: the call returns a handle to a server task whose status is
// `input_required`, carrying the sampling request. The client runs it and
// answers with `tasks/update`, and the task completes with the result.
// Sampling is deprecated as of 2026-07-28 (SEP-2577).

import {
  McpServer,
  CallToolResult,
  inputRequired,
  inputResponse,
  type InputResponseView,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  clientSupportsTasks,
  createTask,
  tasksRequired,
  type TaskState,
} from "../server/tasks.js";

// Tool input schema
const TriggerSamplingRequestAsyncSchema = z.object({
  prompt: z.string().describe("The prompt to send to the LLM"),
  maxTokens: z
    .number()
    .default(100)
    .describe("Maximum number of tokens to generate"),
});

/** The client's answer to a sampling request, as `inputResponse` reads it. */
type SamplingResult = Extract<
  InputResponseView,
  { kind: "sampling" }
>["result"];

// Tool configuration
const name = "trigger-sampling-request-async";
const config = {
  title: "Trigger Async Sampling Request Tool",
  description:
    "Runs as a task on the io.modelcontextprotocol/tasks extension (protocol version 2026-07-28) that needs an " +
    "LLM completion: the task waits in status input_required, carrying a sampling request, until the client " +
    "answers it with tasks/update, then completes with the result. Deprecated: Sampling is deprecated as of " +
    "protocol version 2026-07-28.",
  inputSchema: TriggerSamplingRequestAsyncSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

/**
 * Registers the 'trigger-sampling-request-async' tool, for 2026-07-28 clients.
 *
 * A client that does not declare the tasks extension gets an error result.
 * The SDK checks the sampling capability when the client fetches the
 * request, not here: the request travels inside the task's status.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerSamplingRequestAsyncTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (args, ctx): Promise<CallToolResult> => {
      if (!clientSupportsTasks(ctx)) return tasksRequired(name);
      const { prompt, maxTokens } =
        TriggerSamplingRequestAsyncSchema.parse(args);
      let result: SamplingResult | undefined;

      return createTask(
        {
          stateAt: (): TaskState =>
            result === undefined
              ? {
                  status: "input_required",
                  statusMessage: "Waiting for the client's LLM to respond",
                  inputRequests: {
                    sampling: inputRequired.createMessage({
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
                    }),
                  },
                }
              : {
                  status: "completed",
                  statusMessage: "Sampling complete",
                  result: {
                    content: [
                      {
                        type: "text",
                        text: `LLM sampling result: \n${JSON.stringify(result, null, 2)}`,
                      },
                    ],
                  },
                },
          receive: (responses) => {
            const answer = inputResponse(responses, "sampling");
            if (answer.kind === "sampling") result = answer.result;
          },
        },
        { ttlMs: 10 * 60_000, pollIntervalMs: 1000 },
      );
    },
  );
};
