import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import { TOOL_ICONS } from "../server/icons.js";

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
  icons: TOOL_ICONS,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Registers the 'trigger-long-running-operation' tool.
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
 * The operation watches the request's abort signal, which the SDK fires when the client
 * sends `notifications/cancelled` or the connection closes, in either protocol era. On
 * cancellation it clears its pending timer and stops without sending further progress, so
 * a cancelled operation never holds the process open (#1124, #4846).
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerLongRunningOperationTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (args, ctx): Promise<CallToolResult> => {
      const validatedArgs = TriggerLongRunningOperationSchema.parse(args);
      const { duration, steps } = validatedArgs;
      const stepDuration = duration / steps;
      const progressToken = ctx.mcpReq._meta?.progressToken;
      const signal = ctx.mcpReq.signal;

      for (let i = 1; i < steps + 1; i++) {
        try {
          // Rejects at once, clearing its timer, when the request is cancelled.
          await sleep(stepDuration * 1000, undefined, { signal });
        } catch {
          // The SDK drops the response to a cancelled request, so this result
          // never reaches the client; returning simply ends the handler.
          return {
            content: [
              {
                type: "text",
                text: `Long running operation cancelled after ${i - 1} of ${steps} steps.`,
              },
            ],
          };
        }

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
            { relatedRequestId: ctx.mcpReq.id },
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
    },
  );
};
