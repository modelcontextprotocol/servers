import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  CreateMessageRequest,
  CreateMessageResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Tool input schema
const SamplingRequestSchema = z.object({
  prompt: z.string().describe("The prompt to send to the LLM"),
  maxTokens: z
    .number()
    .default(100)
    .describe("Maximum number of tokens to generate"),
});

// Tool configuration
const name = "sampling-request";
const config = {
  title: "Sampling Request Tool",
  description: "Sends the Client a Request for LLM Sampling",
  inputSchema: SamplingRequestSchema,
};

/**
 * Registers the 'sampling-request' tool within the provided McpServer instance.
 *
 * Allows the server to handle sampling requests by parsing input arguments,
 * generating a sampling request for an LLM, and returning the result to the client.
 *
 * The registered tool performs the following operations:
 * - Validates incoming arguments using `SampleLLMSchema`.
 * - Constructs a request object using provided prompt and maximum tokens.
 * - Sends the request to the server for sampling.
 * - Formats and returns the sampling result content to the client.
 *
 * @param {McpServer} server - The instance of the MCP server where the tool
 *        will be registered.
 */
export const registerSamplingRequestTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (args, extra): Promise<CallToolResult> => {
      const validatedArgs = SamplingRequestSchema.parse(args);
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
          includeContext: "thisServer",
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
};
