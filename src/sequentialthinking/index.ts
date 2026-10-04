#!/usr/bin/env node

// Entry point of the sequential-thinking server. `createServer()` builds a
// fully registered server without connecting it, so tests can link it to an
// SDK Client over an in-memory transport (#4854); `main()` connects a given
// transport; and stdio is only attached when this file is run as the binary,
// so importing it from a test never touches the runner's stdin/stdout.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { SequentialThinkingServer } from "./lib.js";
import { SERVER_VERSION } from "./version.js";

/** Safe boolean coercion that correctly handles string "false". A union+transform,
 * not z.preprocess (whose input type is `unknown`), so toJSONSchema keeps this required. */
const coercedBoolean = z
  .union([z.boolean(), z.string()])
  .transform((val, ctx) => {
    if (typeof val === "boolean") return val;
    if (val.toLowerCase() === "true") return true;
    if (val.toLowerCase() === "false") return false;
    ctx.addIssue({
      code: "custom",
      message: `Expected boolean or "true"/"false" string, received "${val}"`,
    });
    return z.NEVER;
  });

/**
 * Build the sequential-thinking server with its one tool registered. Each call
 * returns an independent server with its own thought history and branches.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "sequential-thinking-server",
    version: SERVER_VERSION,
  });

  const thinkingServer = new SequentialThinkingServer();

  server.registerTool(
    "sequentialthinking",
    {
      title: "Sequential Thinking",
      description: `A detailed tool for dynamic and reflective problem-solving through thoughts.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer

Parameters explained:
- thought: Your current thinking step, which can include:
  * Regular analytical steps
  * Revisions of previous thoughts
  * Questions about previous decisions
  * Realizations about needing more analysis
  * Changes in approach
  * Hypothesis generation
  * Hypothesis verification
- nextThoughtNeeded: True if you need more thinking, even if at what seemed like the end
- thoughtNumber: Current number in sequence (can go beyond initial total if needed)
- totalThoughts: Current estimate of thoughts needed (can be adjusted up/down)
- isRevision: A boolean indicating if this thought revises previous thinking
- revisesThought: If is_revision is true, which thought number is being reconsidered
- branchFromThought: If branching, which thought number is the branching point
- branchId: Identifier for the current branch (if any)
- needsMoreThoughts: If reaching end but realizing more thoughts needed

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on the Chain of Thought steps
9. Repeat the process until satisfied with the solution
10. Provide a single, ideally correct answer as the final output
11. Only set nextThoughtNeeded to false when truly done and a satisfactory answer is reached`,
      inputSchema: {
        thought: z.string().describe("Your current thinking step"),
        nextThoughtNeeded: coercedBoolean.describe(
          "Whether another thought step is needed",
        ),
        thoughtNumber: z.coerce
          .number()
          .int()
          .min(1)
          .describe("Current thought number (numeric value, e.g., 1, 2, 3)"),
        totalThoughts: z.coerce
          .number()
          .int()
          .min(1)
          .describe(
            "Estimated total thoughts needed (numeric value, e.g., 5, 10)",
          ),
        isRevision: coercedBoolean
          .optional()
          .describe("Whether this revises previous thinking"),
        revisesThought: z.coerce
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Which thought is being reconsidered"),
        branchFromThought: z.coerce
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Branching point thought number"),
        branchId: z.string().optional().describe("Branch identifier"),
        needsMoreThoughts: coercedBoolean
          .optional()
          .describe("If more thoughts are needed"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      outputSchema: {
        thoughtNumber: z.number(),
        totalThoughts: z.number(),
        nextThoughtNeeded: z.boolean(),
        branches: z.array(z.string()),
        thoughtHistoryLength: z.number(),
      },
    },
    async (args) => {
      const result = thinkingServer.processThought(args);

      if (result.isError) {
        return result;
      }

      // Parse the JSON response to get structured content
      const parsedContent = JSON.parse(result.content[0].text);

      return {
        content: result.content,
        structuredContent: parsedContent,
      };
    },
  );

  return server;
}

/** Connect a new server to `transport` and announce it on stderr. */
export async function main(transport: Transport): Promise<void> {
  const server = createServer();
  await server.connect(transport);
  console.error("Sequential Thinking MCP Server running on stdio");
}

/**
 * True when `argv1` (the script node was started with) is this module. Both
 * sides go through realpath, so the bin still starts when it is reached
 * through a symlink, as `npx` and `node_modules/.bin` do.
 */
export function isEntryPoint(
  moduleUrl: string,
  argv1: string | undefined,
): boolean {
  if (!argv1) {
    return false;
  }
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

/* v8 ignore start -- runs only when this file is the process entry point (the spawned bin), which stdio-smoke.test.ts exercises; v8 cannot see into that child */
if (isEntryPoint(import.meta.url, process.argv[1])) {
  main(new StdioServerTransport()).catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
  });
}
/* v8 ignore stop */
