// The `simulate-research-query` tool: a simulated deep-research job that runs
// as a task on the Tasks extension (`io.modelcontextprotocol/tasks`), on
// protocol version 2026-07-28 (#4852).
//
// The call returns a task handle at once. The task works through four
// stages, one a second, and the client follows it with `tasks/get`. For an
// ambiguous topic it stops at the third stage with status `input_required`,
// carrying an elicitation that asks which interpretation the user means; the
// client answers it with `tasks/update` and the task carries on. The final
// report arrives inside the `completed` status. The task's progress is worked
// out from the clock when it is read (server/tasks.ts), so nothing runs in
// the background.
//
// SDK v2 removed the experimental 2025-11-25 tasks layer this tool was first
// built on (SEP-1686), so it is registered for 2026-07-28 clients only.

import {
  McpServer,
  CallToolResult,
  acceptedContent,
  inputRequired,
  inputResponse,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  clientSupportsFormElicitation,
  createTask,
  type TaskInputResponses,
  type TaskState,
} from "../server/tasks.js";

// Tool input schema
const SimulateResearchQuerySchema = z.object({
  topic: z
    .string()
    .max(1000)
    .describe(
      "The research topic to investigate (at most 1,000 characters; the task keeps it until it expires)",
    ),
  ambiguous: z
    .boolean()
    .default(false)
    .describe(
      "Simulate an ambiguous query that requires clarification (triggers input_required status)",
    ),
});

/** The stages a research task works through, in order. */
export const STAGES = [
  "Gathering sources",
  "Analyzing content",
  "Synthesizing findings",
  "Generating report",
];

/** How long each stage takes, in milliseconds. */
export const STAGE_DURATION = 1000;

/** The stage an ambiguous query stops before, to ask for a clarification. */
const CLARIFY_AT = 2;

// Tool configuration
const name = "simulate-research-query";
const config = {
  title: "Simulate Research Query",
  description:
    "Simulates a deep research operation that gathers, analyzes, and synthesizes information. " +
    "Runs as a task on the io.modelcontextprotocol/tasks extension (protocol version 2026-07-28): " +
    "the call returns a task handle, and the client polls tasks/get as the task moves through four stages. " +
    "If 'ambiguous' is true and the client supports elicitation, the task pauses with status " +
    "input_required until the client answers its clarification request with tasks/update.",
  inputSchema: SimulateResearchQuerySchema,
  annotations: {
    // Each call creates a task in the process-wide task store.
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

/**
 * Returns contextual interpretation options based on the topic.
 */
function getInterpretationsForTopic(
  topic: string,
): Array<{ const: string; title: string }> {
  const lowerTopic = topic.toLowerCase();

  if (lowerTopic.includes("python")) {
    return [
      { const: "programming", title: "Python programming language" },
      { const: "snake", title: "Python snake species" },
      { const: "comedy", title: "Monty Python comedy group" },
    ];
  }

  return [
    { const: "technical", title: "Technical/scientific perspective" },
    { const: "historical", title: "Historical perspective" },
    { const: "current", title: "Current events/news perspective" },
  ];
}

/**
 * What the user's answer to the clarification request means. An accepted
 * answer counts only if it is one of the interpretations offered for `topic`.
 */
function clarificationFrom(
  responses: TaskInputResponses,
  topic: string,
): string {
  const offered = getInterpretationsForTopic(topic).map((o) => o.const);
  const ClarificationSchema = z.object({
    interpretation: z.string().refine((value) => offered.includes(value)),
  });
  const view = inputResponse(responses, "clarification");
  const accepted = acceptedContent(
    responses,
    "clarification",
    ClarificationSchema,
  );
  if (accepted) return accepted.interpretation;
  if (view.kind === "elicit" && view.action === "decline") {
    return "User declined - using default interpretation";
  }
  if (view.kind === "elicit" && view.action === "cancel") {
    return "User cancelled - using default interpretation";
  }
  return "No usable answer - using default interpretation";
}

/**
 * Generates the final research report with educational content about tasks.
 */
function generateResearchReport(
  topic: string,
  clarification: string | undefined,
): CallToolResult {
  const subject = clarification ? `${topic} (${clarification})` : topic;
  const report = `# Research Report: ${subject}

## Research Parameters
- **Topic**: ${topic}
${clarification ? `- **Clarification**: ${clarification}` : ""}

## Synthesis
This research query was processed through ${STAGES.length} stages:
${STAGES.map((s, i) => `- Stage ${i + 1}: ${s} ✓`).join("\n")}

---

## About This Demo (SEP-2663: the Tasks extension)

This tool demonstrates MCP's task-based execution pattern for long-running operations:

**Task Lifecycle Demonstrated:**
1. \`tools/call\` → the server returns a task handle (\`resultType: "task"\`), not the final result
2. Client polls \`tasks/get\` → the server returns the current status and \`statusMessage\`
3. Status progressed: \`working\` → ${
    clarification ? `\`input_required\` → \`working\` → ` : ""
  }\`completed\`
4. The \`completed\` status carries this final result
${
  clarification
    ? `
**Input Flow:**
The query was ambiguous, so the task paused with status \`input_required\`,
carrying an elicitation request. The client answered it with \`tasks/update\`
("${clarification}"), and the task resumed and completed.
`
    : ""
}
**Key Concepts:**
- Tasks enable "call now, fetch later" patterns
- \`statusMessage\` provides human-readable progress updates
- Tasks have a TTL (\`ttlMs\`) for automatic cleanup
- \`pollIntervalMs\` suggests how often to check status
- A task asks for input in-band, through its \`input_required\` status

*This is a simulated research report from the Everything MCP Server.*
`;

  return { content: [{ type: "text", text: report }] };
}

/**
 * Registers the 'simulate-research-query' tool, for 2026-07-28 clients.
 *
 * A client that does not declare the tasks extension is refused with -32021
 * before the tool runs (`guardTaskTools`), since it could not follow the task
 * handle. `ambiguous` is ignored for a
 * client that does not support elicitation.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerSimulateResearchQueryTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async (args, ctx): Promise<CallToolResult> => {
      const { topic, ambiguous } = SimulateResearchQuerySchema.parse(args);
      // The clarification is a form, so only a form-capable client is asked.
      const canAsk = clientSupportsFormElicitation(ctx);

      // The clock time the stages started counting from, and the stage they
      // started at: an ambiguous query restarts the count once it is answered.
      let startedAt = Date.now();
      let startStage = 0;
      let clarification: string | undefined;
      const needsClarification = () =>
        ambiguous && canAsk && clarification === undefined;

      return createTask(
        {
          stateAt: (now): TaskState => {
            const stage =
              startStage + Math.floor((now - startedAt) / STAGE_DURATION);
            // When the clock reached `stage`, the moment the task entered it.
            const reached = (at: number) =>
              startedAt + (at - startStage) * STAGE_DURATION;
            if (needsClarification() && stage >= CLARIFY_AT) {
              return {
                since: reached(CLARIFY_AT),
                status: "input_required",
                statusMessage: `Found multiple interpretations for "${topic}". Requesting clarification...`,
                inputRequests: {
                  clarification: inputRequired.elicit({
                    message: `The research query "${topic}" could have multiple interpretations. Please clarify what you're looking for:`,
                    requestedSchema: {
                      type: "object",
                      properties: {
                        interpretation: {
                          type: "string",
                          title: "Clarification",
                          description:
                            "Which interpretation of the topic do you mean?",
                          oneOf: getInterpretationsForTopic(topic),
                        },
                      },
                      required: ["interpretation"],
                    },
                  }),
                },
              };
            }
            if (stage >= STAGES.length) {
              return {
                since: reached(STAGES.length),
                status: "completed",
                statusMessage: "Research complete",
                result: generateResearchReport(topic, clarification),
              };
            }
            return {
              since: reached(stage),
              status: "working",
              statusMessage:
                clarification !== undefined && stage === CLARIFY_AT
                  ? `Continuing with interpretation: "${clarification}"...`
                  : `${STAGES[stage]}...`,
            };
          },
          receive: (responses, now) => {
            clarification = clarificationFrom(responses, topic);
            startedAt = now;
            startStage = CLARIFY_AT;
          },
        },
        { ttlMs: 5 * 60_000, pollIntervalMs: STAGE_DURATION },
      );
    },
  );
};
