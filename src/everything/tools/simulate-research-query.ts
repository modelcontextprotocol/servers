import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  GetTaskResult,
  Task,
  ElicitResult,
  ElicitResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CreateTaskResult } from "@modelcontextprotocol/sdk/experimental/tasks";

// Tool input schema
const SimulateResearchQuerySchema = z.object({
  topic: z.string().describe("The research topic to investigate"),
  ambiguous: z
    .boolean()
    .default(false)
    .describe(
      "Simulate an ambiguous query that requires clarification (triggers input_required status)"
    ),
});

// Research stages
const STAGES = [
  "Gathering sources",
  "Analyzing content",
  "Synthesizing findings",
  "Generating report",
];

// Duration per stage in milliseconds
const STAGE_DURATION = 1000;

// Internal state for tracking research tasks
interface ResearchState {
  topic: string;
  ambiguous: boolean;
  currentStage: number;
  clarification?: string;
  completed: boolean;
  result?: CallToolResult;
}

// Map to store research state per task
const researchStates = new Map<string, ResearchState>();

/**
 * Runs the background research process.
 * Updates task status as it progresses through stages.
 * If clarification is needed, attempts elicitation via sendRequest.
 *
 * Note: Elicitation only works on STDIO transport. On HTTP transport,
 * sendRequest will fail and the task will use a default interpretation.
 * Full HTTP support requires SDK PR #1210's elicitInputStream API.
 */
async function runResearchProcess(
  taskId: string,
  args: z.infer<typeof SimulateResearchQuerySchema>,
  taskStore: {
    updateTaskStatus: (
      taskId: string,
      status: Task["status"],
      message?: string
    ) => Promise<void>;
    storeTaskResult: (
      taskId: string,
      status: "completed" | "failed",
      result: CallToolResult
    ) => Promise<void>;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendRequest: any
): Promise<void> {
  const state = researchStates.get(taskId);
  if (!state) return;

  // Process each stage
  for (let i = state.currentStage; i < STAGES.length; i++) {
    state.currentStage = i;

    // Check if task was cancelled externally
    if (state.completed) return;

    // Update status message for current stage
    await taskStore.updateTaskStatus(taskId, "working", `${STAGES[i]}...`);

    // At synthesis stage (index 2), check if clarification is needed
    if (i === 2 && state.ambiguous && !state.clarification) {
      // Update status to show we're requesting input (spec SHOULD)
      await taskStore.updateTaskStatus(
        taskId,
        "input_required",
        `Found multiple interpretations for "${state.topic}". Requesting clarification...`
      );

      try {
        // Try elicitation via sendRequest (works on STDIO, fails on HTTP)
        const elicitResult: ElicitResult = await sendRequest(
          {
            method: "elicitation/create",
            params: {
              message: `The research query "${state.topic}" could have multiple interpretations. Please clarify what you're looking for:`,
              requestedSchema: {
                type: "object",
                properties: {
                  interpretation: {
                    type: "string",
                    title: "Clarification",
                    description:
                      "Which interpretation of the topic do you mean?",
                    oneOf: getInterpretationsForTopic(state.topic),
                  },
                },
                required: ["interpretation"],
              },
            },
          },
          ElicitResultSchema
        );

        // Process elicitation response
        if (elicitResult.action === "accept" && elicitResult.content) {
          state.clarification =
            (elicitResult.content as { interpretation?: string })
              .interpretation || "User accepted without selection";
        } else if (elicitResult.action === "decline") {
          state.clarification = "User declined - using default interpretation";
        } else {
          state.clarification = "User cancelled - using default interpretation";
        }
      } catch (error) {
        // Elicitation failed (likely HTTP transport without streaming support)
        // Use default interpretation and continue - task should still complete
        console.warn(
          `Elicitation failed for task ${taskId} (HTTP transport?):`,
          error instanceof Error ? error.message : String(error)
        );
        state.clarification =
          "technical (default - elicitation unavailable on HTTP)";
      }

      // Resume with working status (spec SHOULD)
      await taskStore.updateTaskStatus(
        taskId,
        "working",
        `Continuing with interpretation: "${state.clarification}"...`
      );

      // Continue processing (no return - just keep going through the loop)
    }

    // Simulate work for this stage
    await new Promise((resolve) => setTimeout(resolve, STAGE_DURATION));
  }

  // All stages complete - generate result
  state.completed = true;
  const result = generateResearchReport(state);
  state.result = result;

  await taskStore.storeTaskResult(taskId, "completed", result);
}

/**
 * Generates the final research report with educational content about tasks.
 */
function generateResearchReport(state: ResearchState): CallToolResult {
  const topic = state.clarification
    ? `${state.topic} (${state.clarification})`
    : state.topic;

  const report = `# Research Report: ${topic}

## Research Parameters
- **Topic**: ${state.topic}
${state.clarification ? `- **Clarification**: ${state.clarification}` : ""}

## Synthesis
This research query was processed through ${STAGES.length} stages:
${STAGES.map((s, i) => `- Stage ${i + 1}: ${s} ✓`).join("\n")}

---

## About This Demo (SEP-1686: Tasks)

This tool demonstrates MCP's task-based execution pattern for long-running operations:

**Task Lifecycle Demonstrated:**
1. \`tools/call\` with \`task\` parameter → Server returns \`CreateTaskResult\` (not the final result)
2. Client polls \`tasks/get\` → Server returns current status and \`statusMessage\`
3. Status progressed: \`working\` → ${
    state.clarification ? `\`input_required\` → \`working\` → ` : ""
  }\`completed\`
4. Client calls \`tasks/result\` → Server returns this final result

${
  state.clarification
    ? `**Elicitation Flow:**
When the query was ambiguous, the server sent an \`elicitation/create\` request
to the client. The task status changed to \`input_required\` while awaiting user input.
${
  state.clarification.includes("unavailable on HTTP")
    ? `
**Note:** Elicitation was skipped because this server is running over HTTP transport.
The current SDK's \`sendRequest\` only works over STDIO. Full HTTP elicitation support
requires SDK PR #1210's streaming \`elicitInputStream\` API.
`
    : `After receiving clarification ("${state.clarification}"), the task resumed processing and completed.`
}
`
    : ""
}
**Key Concepts:**
- Tasks enable "call now, fetch later" patterns
- \`statusMessage\` provides human-readable progress updates
- Tasks have TTL (time-to-live) for automatic cleanup
- \`pollInterval\` suggests how often to check status
- Elicitation requests can be sent directly during task execution

*This is a simulated research report from the Everything MCP Server.*
`;

  return {
    content: [
      {
        type: "text",
        text: report,
      },
    ],
  };
}

/**
 * Registers the 'simulate-research-query' tool as a task-based tool.
 *
 * This tool demonstrates the MCP Tasks feature (SEP-1686) with a real-world scenario:
 * a research tool that gathers and synthesizes information from multiple sources.
 * If the query is ambiguous, it pauses to ask for clarification before completing.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerSimulateResearchQueryTool = (server: McpServer) => {
  // Check if client supports elicitation (needed for input_required flow)
  const clientCapabilities = server.server.getClientCapabilities() || {};
  const clientSupportsElicitation: boolean =
    clientCapabilities.elicitation !== undefined;

  server.experimental.tasks.registerToolTask(
    "simulate-research-query",
    {
      title: "Simulate Research Query",
      description:
        "Simulates a deep research operation that gathers, analyzes, and synthesizes information. " +
        "Demonstrates MCP task-based operations with progress through multiple stages. " +
        "If 'ambiguous' is true and client supports elicitation, sends an elicitation request for clarification.",
      inputSchema: SimulateResearchQuerySchema,
      execution: { taskSupport: "required" },
    },
    {
      /**
       * Creates a new research task and starts background processing.
       */
      createTask: async (args, extra): Promise<CreateTaskResult> => {
        const validatedArgs = SimulateResearchQuerySchema.parse(args);

        // Create the task in the store
        const task = await extra.taskStore.createTask({
          ttl: 300000, // 5 minutes
          pollInterval: 1000,
        });

        // Initialize research state
        const state: ResearchState = {
          topic: validatedArgs.topic,
          ambiguous: validatedArgs.ambiguous && clientSupportsElicitation,
          currentStage: 0,
          completed: false,
        };
        researchStates.set(task.taskId, state);

        // Start background research (don't await - runs asynchronously)
        // Pass sendRequest for elicitation (works on STDIO, gracefully degrades on HTTP)
        runResearchProcess(
          task.taskId,
          validatedArgs,
          extra.taskStore,
          extra.sendRequest
        ).catch((error) => {
          console.error(`Research task ${task.taskId} failed:`, error);
          extra.taskStore
            .updateTaskStatus(task.taskId, "failed", String(error))
            .catch(console.error);
        });

        return { task };
      },

      /**
       * Returns the current status of the research task.
       */
      getTask: async (args, extra): Promise<GetTaskResult> => {
        return await extra.taskStore.getTask(extra.taskId);
      },

      /**
       * Returns the task result.
       * Elicitation is now handled directly in the background process.
       */
      getTaskResult: async (args, extra): Promise<CallToolResult> => {
        // Return the stored result
        const result = await extra.taskStore.getTaskResult(extra.taskId);

        // Clean up state
        researchStates.delete(extra.taskId);

        return result as CallToolResult;
      },
    }
  );
};

/**
 * Returns contextual interpretation options based on the topic.
 */
function getInterpretationsForTopic(
  topic: string
): Array<{ const: string; title: string }> {
  const lowerTopic = topic.toLowerCase();

  // Example: contextual interpretations for "python"
  if (lowerTopic.includes("python")) {
    return [
      { const: "programming", title: "Python programming language" },
      { const: "snake", title: "Python snake species" },
      { const: "comedy", title: "Monty Python comedy group" },
    ];
  }

  // Default generic interpretations
  return [
    { const: "technical", title: "Technical/scientific perspective" },
    { const: "historical", title: "Historical perspective" },
    { const: "current", title: "Current events/news perspective" },
  ];
}
