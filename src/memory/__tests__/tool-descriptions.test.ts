// What the delete_entities and delete_relations descriptions tell a model
// (#5071). Both tools are destructive and share the same annotations, so the
// description is the only place the difference between them lives: each one
// names its sibling, and delete_relations states the exact-match rule that
// otherwise turns a guessed relationType into "Deleted 0 of 1". These tests
// read the descriptions through tools/list, check that every tool they point
// to is registered, and check the behavior each one states.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Tool } from "@modelcontextprotocol/client";
import { call, connect, makeTempGraph } from "./helpers.js";
import type { Connection } from "./helpers.js";

let conn: Connection;
let cleanup: () => Promise<void>;
let tools: Tool[];

beforeEach(async () => {
  const graph = await makeTempGraph();
  cleanup = graph.cleanup;
  conn = await connect(graph.filePath);
  ({ tools } = await conn.client.listTools());
});

afterEach(async () => {
  await conn.close();
  await cleanup();
});

function descriptionOf(name: string): string {
  const description = tools.find((t) => t.name === name)?.description;
  if (description === undefined) throw new Error(`no description: ${name}`);
  return description;
}

async function seed(): Promise<void> {
  await call(conn.client, "create_entities", {
    entities: [
      { name: "Alice", entityType: "person", observations: ["likes tea"] },
      { name: "Acme", entityType: "company", observations: [] },
    ],
  });
  await call(conn.client, "create_relations", {
    relations: [{ from: "Alice", to: "Acme", relationType: "works at" }],
  });
}

describe("delete tool descriptions (#5071)", () => {
  it("delete_entities names delete_relations and delete_observations", () => {
    const description = descriptionOf("delete_entities");
    expect(description).toContain("use delete_relations");
    expect(description).toContain("use delete_observations");
    expect(description).toContain(
      "every relation that points to or from them and all their observations",
    );
  });

  it("delete_relations names delete_entities and states the exact-match rule", () => {
    const description = descriptionOf("delete_relations");
    expect(description).toContain("use delete_entities");
    expect(description).toContain("keep the entities they connect");
    expect(description).toContain("exactly on all three fields");
    expect(description).toContain("call open_nodes (or search_nodes) first");
  });

  it("names only tools the server registers", () => {
    const names = new Set(tools.map((t) => t.name));
    for (const tool of ["delete_entities", "delete_relations"]) {
      for (const named of descriptionOf(tool).match(/\b[a-z]+_[a-z_]+\b/g) ??
        []) {
        expect(names, `${tool} names ${named}`).toContain(named);
      }
    }
  });

  it("delete_entities removes the entity's relations too", async () => {
    await seed();
    await call(conn.client, "delete_entities", { entityNames: ["Acme"] });
    const graph = await call(conn.client, "read_graph");
    expect(graph.structuredContent).toMatchObject({
      entities: [{ name: "Alice" }],
      relations: [],
    });
  });

  it("delete_relations deletes only an exact match and keeps the entities", async () => {
    await seed();
    const miss = await call(conn.client, "delete_relations", {
      relations: [{ from: "Alice", to: "Acme", relationType: "works_at" }],
    });
    expect(miss.structuredContent).toMatchObject({ success: true });
    expect(
      (await call(conn.client, "read_graph")).structuredContent,
    ).toMatchObject({ relations: [{ relationType: "works at" }] });

    await call(conn.client, "delete_relations", {
      relations: [{ from: "Alice", to: "Acme", relationType: "works at" }],
    });
    expect(
      (await call(conn.client, "read_graph")).structuredContent,
    ).toMatchObject({
      entities: [{ name: "Alice" }, { name: "Acme" }],
      relations: [],
    });
  });
});
