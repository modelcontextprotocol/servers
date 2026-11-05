// Asserts that every top-level input property of every memory tool carries a
// non-empty description in tools/list (#5416). Clients and models see only the
// property name when a description is missing, so a new tool or parameter that
// omits one fails here rather than shipping undocumented. Driven through an SDK
// Client over an in-memory transport, so it checks what a client receives.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { connect, makeTempGraph } from "./helpers.js";
import type { Connection } from "./helpers.js";

describe("tool input property descriptions", () => {
  let connection: Connection;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const graph = await makeTempGraph();
    cleanup = graph.cleanup;
    connection = await connect(graph.filePath);
  });

  afterEach(async () => {
    await connection.close();
    await cleanup();
  });

  it("describes every top-level input property of every tool (#5416)", async () => {
    const { tools } = await connection.client.listTools();
    expect(tools.length).toBeGreaterThan(0);

    const undescribed: string[] = [];
    for (const tool of tools) {
      for (const [name, schema] of Object.entries(
        tool.inputSchema.properties ?? {},
      )) {
        const description: unknown =
          typeof schema === "object" && schema !== null
            ? (schema as { description?: unknown }).description
            : undefined;
        if (typeof description !== "string" || description.trim() === "") {
          undescribed.push(`${tool.name}.${name}`);
        }
      }
    }
    expect(undescribed).toEqual([]);
  });

  it("describes the four top-level array parameters named in #5416", async () => {
    const { tools } = await connection.client.listTools();
    const descriptionOf = (tool: string, property: string): unknown => {
      const schema = tools.find((t) => t.name === tool)?.inputSchema
        .properties?.[property];
      return typeof schema === "object" && schema !== null
        ? (schema as { description?: unknown }).description
        : undefined;
    };
    expect(descriptionOf("create_entities", "entities")).toBe(
      "An array of entities to create",
    );
    expect(descriptionOf("create_relations", "relations")).toBe(
      "An array of relations to create",
    );
    expect(descriptionOf("add_observations", "observations")).toBe(
      "An array of entities and the observations to add to each",
    );
    expect(descriptionOf("delete_observations", "deletions")).toBe(
      "An array of entities and the observations to delete from each",
    );
  });
});
