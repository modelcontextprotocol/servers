import {
  McpServer,
  CallToolResult,
  InputRequiredResult,
  inputRequired,
  inputResponse,
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
  description: "Trigger a Request from the Server for LLM Sampling",
  inputSchema: TriggerSamplingRequestSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

// Key for this tool's embedded sampling request.
const COMPLETION = "completion";

/**
 * Registers the 'trigger-sampling-request' tool.
 *
 * The registered tool performs the following operations:
 * - Validates incoming arguments using `TriggerSamplingRequestSchema`.
 * - Asks the client for an LLM completion using the provided prompt and token budget.
 * - Formats and returns the sampling result content to the client.
 *
 * The request is made in the **multi-round-trip** style -- the handler returns
 * `inputRequired(...)` instead of pushing a server->client
 * `sampling/createMessage` request. Written once, it serves both eras: the
 * 2026-07-28 client fulfils and retries, and the SDK's legacy shim converts the
 * same return into a real server->client request for legacy-era connections.
 *
 * Registration is unconditional: the SDK refuses the embedded request with
 * `-32021` at dispatch when the caller never declared the `sampling`
 * capability, on both eras.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerSamplingRequestTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (args, ctx): Promise<CallToolResult | InputRequiredResult> => {
      const validatedArgs = TriggerSamplingRequestSchema.parse(args);
      const { prompt, maxTokens } = validatedArgs;

      const answer = inputResponse(ctx.mcpReq.inputResponses, COMPLETION);

      // First round: ask the client to run the completion.
      if (answer.kind === "missing") {
        return inputRequired({
          inputRequests: {
            [COMPLETION]: inputRequired.createMessage({
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

      // Re-entry: the client ran the completion and retried the call.
      if (answer.kind !== "sampling") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Expected a sampling response for "${COMPLETION}", got "${answer.kind}".`,
            },
          ],
        };
      }

      // Return the result to the client
      return {
        content: [
          {
            type: "text",
            text: `LLM sampling result: \n${JSON.stringify(
              answer.result,
              null,
              2
            )}`,
          },
        ],
      };
    }
  );
};
