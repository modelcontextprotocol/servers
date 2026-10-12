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
import { createTask, type TaskState } from "../server/tasks.js";

// Tool input schema
const TriggerSamplingRequestAsyncSchema = z.object({
  prompt: z
    .string()
    .max(10000)
    .describe(
      "The prompt to send to the LLM (at most 10,000 characters; the task keeps it until it expires)",
    ),
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
 * A client that does not declare both the tasks extension and sampling is
 * refused with -32021 before the tool runs (`guardTaskTools`): the SDK does
 * not check the requests a task carries in its status.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerSamplingRequestAsyncTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const { prompt, maxTokens } = TriggerSamplingRequestAsyncSchema.parse(args);
    const createdAt = Date.now();
    let result: SamplingResult | undefined;
    let answeredAt = createdAt;
    // The key of the outstanding request. A key is never reused once
    // answered, so a re-asked request gets the next one.
    let attempt = 1;
    const key = () => `sampling-${attempt}`;

    return createTask(
      {
        stateAt: (): TaskState =>
          result === undefined
            ? {
                // Waiting since the request, or the last re-ask, went out
                since: answeredAt,
                status: "input_required",
                statusMessage: "Waiting for the client's LLM to respond",
                inputRequests: {
                  [key()]: inputRequired.createMessage({
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
                since: answeredAt,
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
        receive: (responses, now) => {
          answeredAt = now;
          const answer = inputResponse(responses, key());
          // An answer of another kind spends the request: ask again under a
          // new key.
          if (answer.kind === "sampling") result = answer.result;
          else attempt++;
        },
      },
      { ttlMs: 10 * 60_000, pollIntervalMs: 1000 },
    );
  });
};
