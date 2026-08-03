import { z } from "zod";
import {
  McpServer,
  CallToolResult,
  InputRequiredResult,
  ServerContext,
  inputRequired,
  inputResponse,
} from "@modelcontextprotocol/server";
import { requestStateCodec } from "../server/request-state.js";

// Tool input schema
const SimulateResearchQuerySchema = z.object({
  topic: z.string().describe("The research topic to investigate"),
  ambiguous: z
    .boolean()
    .default(false)
    .describe(
      "Simulate an ambiguous query that requires clarification (pauses to elicit)"
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

// The stage at which an ambiguous query pauses to ask for clarification.
const CLARIFY_AT_STAGE = 2;

// Key for this tool's embedded clarification request.
const CLARIFICATION = "clarification";

/**
 * State threaded across rounds of an ambiguous query.
 *
 * Multi-step multi-round-trip flows must carry everything they have learned in
 * `requestState`, because `inputResponses` are **per round** -- each retry
 * carries only that round's answers, never earlier ones. Modelled as a
 * discriminated union on `step` so each re-entry knows exactly what is in
 * scope, per the SDK's phase-switch guidance.
 */
type ResearchState = { step: "awaiting-clarification"; topic: string };

/**
 * Emit a progress notification for one stage.
 *
 * `ctx.mcpReq.notify` binds the notification to the originating request, which
 * is what both eras need: on 2026-07-28 request-scoped notifications flow on
 * that request's own response stream rather than a standalone one.
 *
 * The `progressToken` spans the whole multi-round flow, and progress on a
 * single token MUST increase -- so values are derived from the absolute stage
 * index, not from a per-round counter, and keep increasing across re-entries.
 */
const reportStage = async (ctx: ServerContext, stage: number) => {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  if (progressToken === undefined) return;
  await ctx.mcpReq.notify({
    method: "notifications/progress",
    params: {
      progress: stage + 1,
      total: STAGES.length,
      progressToken,
      message: `${STAGES[stage]}...`,
    },
  });
};

/** Run stages `from`..`to` (exclusive), reporting progress for each. */
const runStages = async (ctx: ServerContext, from: number, to: number) => {
  for (let i = from; i < to; i++) {
    await reportStage(ctx, i);
    await new Promise((resolve) => setTimeout(resolve, STAGE_DURATION));
  }
};

/**
 * Registers the 'simulate-research-query' tool.
 *
 * Simulates a long-running research operation that moves through four stages,
 * reporting progress as it goes. When `ambiguous` is set, it pauses partway to
 * ask the user which interpretation of the topic they meant, then resumes with
 * that answer and produces the report.
 *
 * ## Why this is not a task-based tool any more
 *
 * The v1 version modelled this with the experimental tasks API
 * (`server.experimental.tasks.registerToolTask`): `tools/call` returned a
 * `CreateTaskResult`, the client polled `tasks/get`, and clarification was
 * queued through the task message queue via `relatedTask`. All of that is gone:
 *
 * - SDK v2 removed the experimental tasks interception layer entirely.
 * - 2026-07-28 moved tasks out of the core protocol into an extension
 *   (`io.modelcontextprotocol/tasks`, SEP-2663) with a different wire shape.
 * - The SDK cannot serve that extension. Methods deleted by a revision are
 *   physically absent from that era's registry, so an inbound `tasks/get` on a
 *   modern-era connection is answered `-32601` *even if a handler is registered*
 *   -- and `tasks/*` are spec names, so they cannot be registered as
 *   vendor-prefixed custom methods either. Serving the extension today requires
 *   intercepting `tasks/*` outside the SDK, which has no clean stdio equivalent.
 *
 * What the tool demonstrated is preserved without any of that machinery. The
 * long-running staged operation and its progress reporting are unchanged, and
 * the mid-flight clarification is now a multi-round-trip `inputRequired(...)`
 * return -- written once, served to modern-era clients natively and to legacy-era
 * clients by the SDK's legacy shim. Only the task *wire shape* is lost, and
 * only because the SDK cannot put it on the wire.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerSimulateResearchQueryTool = (server: McpServer) => {
  server.registerTool(
    "simulate-research-query",
    {
      title: "Simulate Research Query",
      description:
        "Simulates a deep research operation that gathers, analyzes, and synthesizes information. " +
        "Reports progress through multiple stages. If 'ambiguous' is true, pauses partway to ask " +
        "the user which interpretation of the topic they meant, then resumes.",
      inputSchema: SimulateResearchQuerySchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args, ctx): Promise<CallToolResult | InputRequiredResult> => {
      const { topic, ambiguous } = SimulateResearchQuerySchema.parse(args);
      const state = ctx.mcpReq.requestState<ResearchState>();

      switch (state?.step) {
        case undefined: {
          // First round. Work up to the clarification point.
          if (!ambiguous) {
            await runStages(ctx, 0, STAGES.length);
            return generateResearchReport(topic);
          }

          await runStages(ctx, 0, CLARIFY_AT_STAGE);
          return inputRequired({
            inputRequests: {
              [CLARIFICATION]: inputRequired.elicit({
                message:
                  `The research query "${topic}" could have multiple ` +
                  `interpretations. Please clarify what you're looking for:`,
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
            // Carry the topic forward: the retry's `inputResponses` hold only
            // the clarification, and nothing else survives the round.
            requestState: await requestStateCodec.mint(
              { step: "awaiting-clarification", topic },
              ctx
            ),
          });
        }

        case "awaiting-clarification": {
          // Re-entry. The seam has already verified the seal on `requestState`.
          const answer = inputResponse(
            ctx.mcpReq.inputResponses,
            CLARIFICATION
          );
          const clarification = readClarification(answer);

          // Finish the remaining stages, continuing the same progress token.
          await runStages(ctx, CLARIFY_AT_STAGE, STAGES.length);
          return generateResearchReport(state.topic, clarification);
        }
      }
    }
  );
};

/**
 * Interpret the client's answer to the clarification request.
 *
 * Content comes from the client and is NOT re-validated against
 * `requestedSchema` on either era, so it is read defensively. A decline or
 * cancel is not a failure here -- the research just proceeds with a default.
 */
const readClarification = (
  answer: ReturnType<typeof inputResponse>
): string => {
  if (answer.kind !== "elicit") {
    return "no response - using default interpretation";
  }
  if (answer.action === "decline") {
    return "User declined - using default interpretation";
  }
  if (answer.action === "cancel") {
    return "User cancelled - using default interpretation";
  }
  const interpretation = answer.content?.interpretation;
  return typeof interpretation === "string" && interpretation.length > 0
    ? interpretation
    : "User accepted without selection";
};

/**
 * Generates the final research report.
 */
function generateResearchReport(
  topic: string,
  clarification?: string
): CallToolResult {
  const heading = clarification ? `${topic} (${clarification})` : topic;

  const report = `# Research Report: ${heading}

## Research Parameters
- **Topic**: ${topic}
${clarification ? `- **Clarification**: ${clarification}` : ""}

## Synthesis
This research query was processed through ${STAGES.length} stages:
${STAGES.map((s, i) => `- Stage ${i + 1}: ${s} ✓`).join("\n")}

---

## About This Demo (Multi Round-Trip Requests, SEP-2322)

This tool demonstrates a long-running operation that needs input partway through:

1. \`tools/call\` starts the work and reports progress per stage via
   \`notifications/progress\`.
${
  clarification
    ? `2. Hitting an ambiguity, the handler **returns** an \`input_required\` result
   carrying an embedded \`elicitation/create\` request -- it does not push a
   server-to-client request, which the 2026-07-28 revision removed entirely.
3. The client answers and **retries the original call**, echoing the server's
   opaque \`requestState\` (HMAC-sealed here, and verified before this handler
   was re-entered) so the topic survives the round trip.
4. The handler resumes from where it paused and returns this report.
`
    : `2. With an unambiguous topic the work runs straight through. Pass
   \`ambiguous: true\` to see the multi-round-trip clarification flow.
`
}
**Key concepts:**
- The handler is written **once** and serves both protocol eras. On 2026-07-28
  the client fulfils the embedded request and retries; on a legacy-era connection
  the SDK's legacy shim turns the same return into a real server-to-client
  \`elicitation/create\` over the live session. The handler cannot tell which.
- \`inputResponses\` are **per round** -- anything that must survive a round
  goes in \`requestState\`.
- \`requestState\` round-trips through the client, so it is untrusted on
  re-entry and is integrity-protected.

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
