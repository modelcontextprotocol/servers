import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResult,
  GetTaskResult,
  Task,
  ElicitResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CreateTaskResult } from "@modelcontextprotocol/sdk/experimental";

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
  waitingForClarification: boolean;
  completed: boolean;
  result?: CallToolResult;
}

// Map to store research state per task
const researchStates = new Map<string, ResearchState>();

/**
 * Runs the background research process.
 * Updates task status as it progresses through stages.
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
  }
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
      state.waitingForClarification = true;
      await taskStore.updateTaskStatus(
        taskId,
        "input_required",
        `Found multiple interpretations for "${state.topic}". Please clarify your intent.`
      );
      // Wait for clarification - the getTaskResult handler will resume this
      return;
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
3. Status progressed: \`working\` → ${state.clarification ? `\`input_required\` → \`working\` → ` : ""}\`completed\`
4. Client calls \`tasks/result\` → Server returns this final result

${state.clarification ? `**input_required Flow:**
When the query was ambiguous, the task paused with \`input_required\` status.
The client called \`tasks/result\` prematurely, which triggered an elicitation
request via the side-channel. After receiving clarification ("${state.clarification}"),
the task resumed processing.
` : ""}
**Key Concepts:**
- Tasks enable "call now, fetch later" patterns
- \`statusMessage\` provides human-readable progress updates
- Tasks have TTL (time-to-live) for automatic cleanup
- \`pollInterval\` suggests how often to check status

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
        "If 'ambiguous' is true and client supports elicitation, pauses for clarification (input_required status).",
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
          waitingForClarification: false,
          completed: false,
        };
        researchStates.set(task.taskId, state);

        // Start background research (don't await - runs asynchronously)
        runResearchProcess(task.taskId, validatedArgs, extra.taskStore).catch(
          (error) => {
            console.error(`Research task ${task.taskId} failed:`, error);
            extra.taskStore
              .updateTaskStatus(task.taskId, "failed", String(error))
              .catch(console.error);
          }
        );

        return { task };
      },

      /**
       * Returns the current status of the research task.
       */
      getTask: async (args, extra): Promise<GetTaskResult> => {
        const task = await extra.taskStore.getTask(extra.taskId);
        // The SDK's RequestTaskStore.getTask throws if not found, so task is always defined
        return task;
      },

      /**
       * Returns the task result, or handles input_required via elicitation side-channel.
       */
      getTaskResult: async (args, extra): Promise<CallToolResult> => {
        const task = await extra.taskStore.getTask(extra.taskId);
        const state = researchStates.get(extra.taskId);

        // Handle input_required - use tasks/result as side-channel for elicitation
        if (task?.status === "input_required" && state?.waitingForClarification) {
          // Send elicitation request through the side-channel
          const elicitationResult = await extra.sendRequest(
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
                      description: "Which interpretation of the topic do you mean?",
                      oneOf: getInterpretationsForTopic(state.topic),
                    },
                  },
                  required: ["interpretation"],
                },
              },
            },
            ElicitResultSchema,
            { timeout: 5 * 60 * 1000 /* 5 minutes */ }
          );

          // Process elicitation response
          if (
            elicitationResult.action === "accept" &&
            elicitationResult.content
          ) {
            state.clarification =
              (elicitationResult.content as { interpretation?: string })
                .interpretation || "User accepted without selection";
          } else if (elicitationResult.action === "decline") {
            state.clarification = "User declined - using default interpretation";
          } else {
            state.clarification = "User cancelled - using default interpretation";
          }

          state.waitingForClarification = false;

          // Resume background processing from current stage
          runResearchProcess(extra.taskId, {
            topic: state.topic,
            ambiguous: false, // Don't ask again
          }, extra.taskStore).catch((error) => {
            console.error(`Research task ${extra.taskId} failed:`, error);
            extra.taskStore
              .updateTaskStatus(extra.taskId, "failed", String(error))
              .catch(console.error);
          });

          // Return indication that work is resuming (client should poll again)
          return {
            content: [
              {
                type: "text",
                text: `Resuming research with clarification: "${state.clarification}"`,
              },
            ],
          };
        }

        // Normal case: return the stored result
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
