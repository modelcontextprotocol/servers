#!/usr/bin/env node

// Entry point of the sequential-thinking server. `createServer()` builds a
// fully registered server without connecting it, so tests can link it to an
// SDK Client over an in-memory transport (#4854); `main()` serves it through
// the SDK's `serveStdio` entry, which answers both 2026-07-28 clients
// (`server/discover`, no handshake) and 2025-era clients (`initialize`) from
// the same factory (#4852); and stdio is only attached when this file is run
// as the binary, so importing it from a test never touches the runner's
// stdin/stdout.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  serveStdio,
  type StdioServerHandle,
} from "@modelcontextprotocol/server/stdio";
import { McpServer } from "@modelcontextprotocol/server";
import type { Transport } from "@modelcontextprotocol/server";
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
 * `serveStdio` calls it once per connection, so the history lives exactly as
 * long as the client's connection, on either protocol era.
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
      // At most 1024 characters, the cap OpenAI and Azure OpenAI put on a tool
      // description (#799). Each parameter is explained by its own inputSchema
      // description, which clients send too, so this text carries only when to
      // call the tool and the guidance those field descriptions do not (#4507).
      description: `A detailed tool for dynamic and reflective problem-solving through thoughts.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

You should:
1. Estimate totalThoughts up front and adjust it up or down as you go; thoughtNumber may exceed it
2. Question or revise earlier thoughts (isRevision with revisesThought), or branch (branchFromThought with branchId)
3. Express uncertainty, and ignore information irrelevant to the current step
4. Generate a solution hypothesis, verify it against the earlier steps, and repeat until satisfied
5. Set nextThoughtNeeded to false only when truly done and a satisfactory answer is reached`,
      inputSchema: z.object({
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
      }),
      annotations: {
        // Every call appends to the server's in-memory thought history, and a
        // call with both branchFromThought and branchId also appends to that
        // branch, so the tool is neither read-only nor idempotent (#4721).
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      outputSchema: z.object({
        thoughtNumber: z.number(),
        totalThoughts: z.number(),
        nextThoughtNeeded: z.boolean(),
        branches: z.array(z.string()),
        thoughtHistoryLength: z.number(),
      }),
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

/**
 * Serve the server on `transport` (the process's stdio by default) and
 * announce it on stderr. The first message the client sends picks the
 * connection's protocol era. A transport error, including one that stops the
 * transport from starting, is reported on stderr.
 */
export function main(transport?: Transport): StdioServerHandle {
  const handle = serveStdio(() => createServer(), {
    transport,
    // serveStdio reports a transport that fails, including one that cannot
    // start, here rather than by rejecting, so record the failure in the
    // exit status for whatever supervises the process.
    onerror: (error) => {
      console.error("Transport error:", error);
      process.exitCode = 1;
    },
  });
  console.error("Sequential Thinking MCP Server running on stdio");
  return handle;
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
  main();
}
/* v8 ignore stop */
