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
  inputRequired,
  inputResponse,
} from "@modelcontextprotocol/server";
import {
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

/** The form the task asks the user to fill in. */
const requestedSchema = {
  type: "object" as const,
  properties: {
    name: {
      type: "string" as const,
      title: "Your Name",
      description: "Enter your name",
    },
    favoriteColor: {
      type: "string" as const,
      title: "Favorite Color",
      description: "What is your favorite color?",
      enum: ["red", "orange", "yellow", "green", "blue", "purple"],
    },
    agreeToTerms: {
      type: "boolean" as const,
      title: "Agree to Terms",
      description: "Do you agree to the terms and conditions?",
    },
  },
  required: ["name"],
};

/** The completed task's summary of the user's answer. */
function summarize(
  action: string,
  content: Record<string, unknown> | undefined,
): CallToolResult {
  const lines = [`Elicitation ${action}.`];
  if (action === "accept" && content) {
    if (content.name) lines.push(`Name: ${content.name}`);
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
      let summary: CallToolResult | undefined;

      return createTask(
        {
          stateAt: (): TaskState =>
            summary === undefined
              ? {
                  status: "input_required",
                  statusMessage: "Waiting for the user's input",
                  inputRequests: {
                    form: inputRequired.elicit({
                      message:
                        "Please provide inputs for the following fields (async task demo):",
                      requestedSchema,
                    }),
                  },
                }
              : {
                  status: "completed",
                  statusMessage: "Input received",
                  result: summary,
                },
          receive: (responses) => {
            const answer = inputResponse(responses, "form");
            if (answer.kind === "elicit") {
              summary = summarize(answer.action, answer.content);
            }
          },
        },
        { ttlMs: 10 * 60_000, pollIntervalMs: 1000 },
      );
    },
  );
};
