import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  CreateMessageRequest,
  CreateMessageResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
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
};

/**
 * Registers the 'trigger-sampling-request' tool.
 *
 * If the client does not support the sampling capability, the tool is not registered.
 *
 * The registered tool performs the following operations:
 * - Validates incoming arguments using `TriggerSamplingRequestSchema`.
 * - Constructs a `sampling/createMessage` request object using provided prompt and maximum tokens.
 * - Sends the request to the server for sampling.
 * - Formats and returns the sampling result content to the client.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerSamplingRequestTool = (server: McpServer) => {
  // Does the client support sampling?
  const clientCapabilities = server.server.getClientCapabilities() || {};
  const clientSupportsSampling: boolean =
    clientCapabilities.sampling !== undefined;

  // If so, register tool
  if (clientSupportsSampling) {
    server.registerTool(
      name,
      config,
      async (args, extra): Promise<CallToolResult> => {
        const validatedArgs = TriggerSamplingRequestSchema.parse(args);
        const { prompt, maxTokens } = validatedArgs;

        // Create the sampling request
        const request: CreateMessageRequest = {
          method: "sampling/createMessage",
          params: {
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

        // Send the sampling request to the client
        const result = await extra.sendRequest(
          request,
          CreateMessageResultSchema
        );

        // Return the result to the client
        return {
          content: [
            {
              type: "text",
              text: `LLM sampling result: \n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }
    );
  }
};
