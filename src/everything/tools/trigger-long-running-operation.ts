import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool input schema
const TriggerLongRunningOperationSchema = z.object({
  duration: z
    .number()
    .default(10)
    .describe("Duration of the operation in seconds"),
  steps: z.number().default(5).describe("Number of steps in the operation"),
});

// Tool configuration
const name = "trigger-long-running-operation";
const config = {
  title: "Trigger Long Running Operation Tool",
  description: "Demonstrates a long running operation with progress updates.",
  inputSchema: TriggerLongRunningOperationSchema,
};

/**
 * Registers the 'trigger-tong-running-operation' tool.
 *
 * The registered tool starts a long-running operation defined by a specific duration and
 * number of steps.
 *
 * Progress notifications are sent back to the client at each step if a `progressToken`
 * is provided in the metadata.
 *
 * At the end of the operation, the tool returns a message indicating the completion of the
 * operation, including the total duration and steps.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerLongRunningOperationTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (args, extra): Promise<CallToolResult> => {
      const validatedArgs = TriggerLongRunningOperationSchema.parse(args);
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
