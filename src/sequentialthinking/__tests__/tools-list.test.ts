// Pins what a client sees when it connects and lists tools: the server's
// identity and capabilities, and the one tool's name, title, description,
// annotations, input schema and output schema, exactly as the SDK emits them
// today. These are characterization tests. The annotations assert the values
// fixed in #4721 (the tool is stateful, so neither read-only nor idempotent).
// The 2781-character description (#799) is pinned as current design: the
// 1024 cap is an OpenAI/Azure client limit, not the MCP spec.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { connect, TOOL_NAME, type Connected } from "./helpers.js";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

type ListedTool = Awaited<
  ReturnType<Connected["client"]["listTools"]>
>["tools"][number];

describe("sequentialthinking: initialize and tools/list", () => {
  let conn: Connected;
  let tool: ListedTool;

  beforeAll(async () => {
    conn = await connect();
    const { tools } = await conn.client.listTools();
    expect(tools).toHaveLength(1);
    tool = tools[0];
  });

  afterAll(async () => {
    await conn.close();
  });

  it("reports its name and the package.json version in serverInfo", () => {
    expect(conn.client.getServerVersion()).toEqual({
      name: "sequential-thinking-server",
      version: packageJson.version,
    });
  });

  it("advertises only the tools capability, with listChanged", () => {
    expect(conn.client.getServerCapabilities()).toEqual({
      tools: { listChanged: true },
    });
  });

  it("lists exactly one tool, named sequentialthinking, titled Sequential Thinking", () => {
    expect(tool.name).toBe(TOOL_NAME);
    expect(tool.title).toBe("Sequential Thinking");
  });

  // #4721: every call appends to the server's thought history, and a call with
  // both branchFromThought and branchId also appends to that branch, so the
  // tool is neither read-only nor idempotent. It is still not destructive (it
  // only appends) and not open-world.
  it("advertises the tool as stateful: not read-only, not idempotent, not destructive, closed-world", () => {
    expect(tool.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  // SDK v2 removed the experimental tasks layer and no longer advertises
  // `execution.taskSupport`; Part 5 (#4852) restores task semantics.
  it.skip("forbids task-augmented execution", () => {
    expect(tool.execution).toEqual({ taskSupport: "forbidden" });
  });

  // #799: some clients cap a tool description at 1024 characters. This one is
  // 2781 today; asserting <= 1024 would fail, so the current length is pinned.
  it("has a 2781-character description today (#799)", () => {
    expect(tool.description).toHaveLength(2781);
    expect(tool.description).toMatch(
      /^A detailed tool for dynamic and reflective problem-solving through thoughts\.\n/,
    );
    expect(tool.description).toMatch(
      /11\. Only set nextThoughtNeeded to false when truly done and a satisfactory answer is reached$/,
    );
  });

  it("advertises the input schema as JSON Schema 2020-12", () => {
    expect(tool.inputSchema).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        thought: { type: "string", description: "Your current thinking step" },
        nextThoughtNeeded: {
          description: "Whether another thought step is needed",
          anyOf: [{ type: "boolean" }, { type: "string" }],
        },
        thoughtNumber: {
          type: "integer",
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER,
          description: "Current thought number (numeric value, e.g., 1, 2, 3)",
        },
        totalThoughts: {
          type: "integer",
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER,
          description:
            "Estimated total thoughts needed (numeric value, e.g., 5, 10)",
        },
        isRevision: {
          description: "Whether this revises previous thinking",
          anyOf: [{ type: "boolean" }, { type: "string" }],
        },
        revisesThought: {
          description: "Which thought is being reconsidered",
          type: "integer",
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        branchFromThought: {
          description: "Branching point thought number",
          type: "integer",
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        branchId: { description: "Branch identifier", type: "string" },
        needsMoreThoughts: {
          description: "If more thoughts are needed",
          anyOf: [{ type: "boolean" }, { type: "string" }],
        },
      },
      required: [
        "thought",
        "nextThoughtNeeded",
        "thoughtNumber",
        "totalThoughts",
      ],
    });
  });

  it("advertises a closed output schema with all five fields required", () => {
    expect(tool.outputSchema).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        thoughtNumber: { type: "number" },
        totalThoughts: { type: "number" },
        nextThoughtNeeded: { type: "boolean" },
        branches: { type: "array", items: { type: "string" } },
        thoughtHistoryLength: { type: "number" },
      },
      required: [
        "thoughtNumber",
        "totalThoughts",
        "nextThoughtNeeded",
        "branches",
        "thoughtHistoryLength",
      ],
      additionalProperties: false,
    });
  });

  it("answers ping", async () => {
    await expect(conn.client.ping()).resolves.toEqual({});
  });

  it("offers no prompts or resources", async () => {
    // Raw requests: SDK v2's listPrompts() and listResources() answer empty
    // lists without asking a server that does not advertise them.
    await expect(
      conn.client.request({ method: "prompts/list", params: {} }),
    ).rejects.toThrow(/Method not found/);
    await expect(
      conn.client.request({ method: "resources/list", params: {} }),
    ).rejects.toThrow(/Method not found/);
  });

  it("rejects an unknown tool with -32602", async () => {
    await expect(
      conn.client.callTool({ name: "no_such_tool", arguments: {} }),
    ).rejects.toMatchObject({
      code: -32602,
      message: "Tool no_such_tool not found",
    });
  });
});
