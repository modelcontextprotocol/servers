// The `trigger-elicitation-request-async` tool: a task on the Tasks extension
// (`io.modelcontextprotocol/tasks`) that needs the user's input before it can
// finish, on protocol version 2026-07-28 (#4852).
//
// On 2025-11-25 this tool sent the client a task-augmented
// `elicitation/create` request and polled the client's own task. The
// 2026-07-28 revision has no server-to-client requests, so the roles turn
// around: the call returns a handle to a server task whose status is
// `input_required`, carrying the elicitation. The client shows it to the user
// and answers with `tasks/update`, and the task completes with a summary.

import {
  McpServer,
  CallToolResult,
  acceptedContent,
  inputRequired,
  inputResponse,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  capabilityRequired,
  clientSupportsFormElicitation,
  clientSupportsTasks,
  createTask,
  tasksRequired,
  type TaskState,
} from "../server/tasks.js";

// Tool configuration
const name = "trigger-elicitation-request-async";
const config = {
  title: "Trigger Async Elicitation Request Tool",
  description:
    "Runs as a task on the io.modelcontextprotocol/tasks extension (protocol version 2026-07-28) that needs " +
    "the user's input: the task waits in status input_required, carrying an elicitation request, until the " +
    "client answers it with tasks/update, then completes with a summary of the answer.",
  inputSchema: {},
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

/**
 * The form the task asks the user to fill in. The same schema is sent as the
 * requested schema and checks the answer, since the client's answer is
 * untrusted: an accepted answer that does not fit leaves the task waiting.
 */
const FormSchema = z.object({
  name: z
    .string()
    .min(1)
    .meta({ title: "Your Name" })
    .describe("Enter your name"),
  favoriteColor: z
    .enum(["red", "orange", "yellow", "green", "blue", "purple"])
    .optional()
    .meta({ title: "Favorite Color" })
    .describe("What is your favorite color?"),
  agreeToTerms: z
    .boolean()
    .optional()
    .meta({ title: "Agree to Terms" })
    .describe("Do you agree to the terms and conditions?"),
});

/** The completed task's summary of the user's answer. */
function summarize(
  action: string,
  content?: z.infer<typeof FormSchema>,
): CallToolResult {
  const lines = [`Elicitation ${action}.`];
  if (content) {
    lines.push(`Name: ${content.name}`);
    if (content.favoriteColor) {
      lines.push(`Favorite color: ${content.favoriteColor}`);
    }
    if (content.agreeToTerms !== undefined) {
      lines.push(`Agreed to terms: ${content.agreeToTerms}`);
    }
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/**
 * Registers the 'trigger-elicitation-request-async' tool, for 2026-07-28
 * clients.
 *
 * A client that does not declare the tasks extension gets an error result.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerTriggerElicitationRequestAsyncTool = (
  server: McpServer,
) => {
  server.registerTool(
    name,
    config,
    async (_args, ctx): Promise<CallToolResult> => {
      if (!clientSupportsTasks(ctx)) return tasksRequired(name);
      if (!clientSupportsFormElicitation(ctx)) {
        return capabilityRequired(name, "elicitation (form mode)");
      }
      const createdAt = Date.now();
      let summary: CallToolResult | undefined;
      let answeredAt = createdAt;

      return createTask(
        {
          stateAt: (): TaskState =>
            summary === undefined
              ? {
                  since: createdAt,
                  status: "input_required",
                  statusMessage: "Waiting for the user's input",
                  inputRequests: {
                    form: inputRequired.elicit({
                      message:
                        "Please provide inputs for the following fields (async task demo):",
                      requestedSchema: FormSchema,
                    }),
                  },
                }
              : {
                  since: answeredAt,
                  status: "completed",
                  statusMessage: "Input received",
                  result: summary,
                },
          receive: (responses, now) => {
            const answer = inputResponse(responses, "form");
            if (answer.kind !== "elicit") return;
            if (answer.action !== "accept") {
              summary = summarize(answer.action);
            } else {
              const content = acceptedContent(responses, "form", FormSchema);
              // An accepted answer that does not fit the form is ignored, so
              // the task keeps waiting for one that does.
              if (content === undefined) return;
              summary = summarize("accept", content);
            }
            answeredAt = now;
          },
        },
        { ttlMs: 10 * 60_000, pollIntervalMs: 1000 },
      );
    },
  );
};
