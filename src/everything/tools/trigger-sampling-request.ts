// The `trigger-sampling-request` tool: asks the client's LLM for a completion
// and returns what it sent back.
//
// Written once for both protocol eras with a multi-round-trip request
// (#4852): the first call returns `input_required` carrying a
// `sampling/createMessage` request, the client runs it and retries, and the
// retry returns the result. A 2026-07-28 client does that in-band; for a
// 2025-era client the SDK's legacy shim sends a real `sampling/createMessage`
// request and re-enters the handler with the answer. Sampling is deprecated
// as of 2026-07-28 (SEP-2577).

import {
  McpServer,
  CallToolResult,
  inputRequired,
  inputResponse,
  type InputRequiredResult,
} from "@modelcontextprotocol/server";
import { z } from "zod";

// Tool input schema
const TriggerSamplingRequestSchema = z.object({
  prompt: z.string().describe("The prompt to send to the LLM"),
  maxTokens: z
    .number()
    .default(100)
    .describe("Maximum number of tokens to generate"),
});

// Tool configuration
const name = "trigger-sampling-request";
const config = {
  title: "Trigger Sampling Request Tool",
  description:
    "Trigger a Request from the Server for LLM Sampling. Deprecated: Sampling is deprecated as of protocol " +
    "version 2026-07-28. The server asks with a multi-round-trip request on every protocol version.",
  inputSchema: TriggerSamplingRequestSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

/**
 * Registers the 'trigger-sampling-request' tool.
 *
 * The tool needs a client that supports sampling: on a 2025-era connection
 * the server factory registers it only for one that declared the capability,
 * and on 2026-07-28 the SDK refuses the embedded request (-32021) of a client
 * whose request did not declare it.
 *
 * The first round returns the `sampling/createMessage` request built from the
 * prompt and token limit; the retry formats the client's result.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerSamplingRequestTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (args, ctx): Promise<CallToolResult | InputRequiredResult> => {
      const { prompt, maxTokens } = TriggerSamplingRequestSchema.parse(args);
      const answer = inputResponse(ctx.mcpReq.inputResponses, "sampling");

      // First round: ask the client to sample
      if (answer.kind !== "sampling") {
        return inputRequired({
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
        });
      }

      // Return the result to the client
      return {
        content: [
          {
            type: "text",
            text: `LLM sampling result: \n${JSON.stringify(answer.result, null, 2)}`,
          },
        ],
      };
    },
  );
};
