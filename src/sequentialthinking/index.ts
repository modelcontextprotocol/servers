#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SequentialThinkingServer } from './lib.js';

/** Safe boolean coercion that correctly handles string "false" */
const coercedBoolean = z.preprocess((val) => {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    if (val.toLowerCase() === "true") return true;
    if (val.toLowerCase() === "false") return false;
  }
  return val;
}, z.boolean());

const server = new McpServer({
  name: "sequential-thinking-server",
  version: "0.2.0",
});

const thinkingServer = new SequentialThinkingServer();
const toolDescription = `Use this tool for structured, step-by-step problem solving that may need revision or branching.
It records a numbered thought, whether more thinking is needed, and optional revision or branch metadata.

Use it when a task benefits from breaking work into steps, revising earlier assumptions, exploring alternatives, or extending the plan as new information appears.

Guidance:
- Start with an estimated totalThoughts count and adjust it as needed.
- Set nextThoughtNeeded to true until the answer is ready.
- Mark revisions with isRevision and revisesThought.
- Mark branches with branchFromThought and branchId.
- Use needsMoreThoughts when the current sequence should continue beyond the estimate.
- Finish only when the reasoning is complete enough to produce the final answer.`;

server.registerTool(
  "sequentialthinking",
  {
    title: "Sequential Thinking",
    description: toolDescription,
    inputSchema: {
      thought: z.string().describe("Your current thinking step"),
      nextThoughtNeeded: coercedBoolean.describe("Whether another thought step is needed"),
      thoughtNumber: z.coerce.number().int().min(1).describe("Current thought number (numeric value, e.g., 1, 2, 3)"),
      totalThoughts: z.coerce.number().int().min(1).describe("Estimated total thoughts needed (numeric value, e.g., 5, 10)"),
      isRevision: coercedBoolean.optional().describe("Whether this revises previous thinking"),
      revisesThought: z.coerce.number().int().min(1).optional().describe("Which thought is being reconsidered"),
      branchFromThought: z.coerce.number().int().min(1).optional().describe("Branching point thought number"),
      branchId: z.string().optional().describe("Branch identifier"),
      needsMoreThoughts: coercedBoolean.optional().describe("If more thoughts are needed")
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
      thoughtHistoryLength: z.number()
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
      structuredContent: parsedContent
    };
  }
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sequential Thinking MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
