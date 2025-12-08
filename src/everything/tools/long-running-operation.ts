import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool input schema
const LongRunningOperationSchema = z.object({
  duration: z
    .number()
    .default(10)
    .describe("Duration of the operation in seconds"),
  steps: z.number().default(5).describe("Number of steps in the operation"),
});

// Tool configuration
const name = "long-running-operation";
const config = {
  title: "Long Running Operation Tool",
  description: "Demonstrates a long running operation with progress updates",
  inputSchema: LongRunningOperationSchema,
};

/**
 * Registers a tool to demonstrate long-running operations on the server.
 *
 * This function defines and registers a tool with the provided server instance that performs a
 * long-running operation defined by a specific duration and number of steps. The progress
 * of the operation is reported back to the client through notifications.
 *
 * The tool processes the operation in steps, with each step having equal duration.
 * Progress notifications are sent back to the client at each step, if a `progressToken`
 * is provided in the metadata. At the end of the operation, the tool returns a message
 * indicating the completion of the operation, including the total duration and steps.
 *
 * @param {McpServer} server - The server instance where the tool should be registered.
 * The server is responsible for receiving and handling requests, as well as sending progress notifications.
 */
export const registerLongRunningOperationTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (args, extra): Promise<CallToolResult> => {
      const validatedArgs = LongRunningOperationSchema.parse(args);
      const { duration, steps } = validatedArgs;
      const stepDuration = duration / steps;
      const progressToken = extra._meta?.progressToken;

      for (let i = 1; i < steps + 1; i++) {
        await new Promise((resolve) =>
          setTimeout(resolve, stepDuration * 1000)
        );

        if (progressToken !== undefined) {
          await server.server.notification(
            {
              method: "notifications/progress",
              params: {
                progress: i,
                total: steps,
                progressToken,
              },
            },
            { relatedRequestId: extra.requestId }
          );
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Long running operation completed. Duration: ${duration} seconds, Steps: ${steps}.`,
          },
        ],
      };
    }
  );
};
