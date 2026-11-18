// Characterization tests for #5541: what a stored record that fails the schema
// costs once it is in the graph file. #4885 made the server skip such a line
// on read and write it back verbatim on every save, so that a write never
// drops data it could not read (persistence.test.ts pins both). The
// consequence pinned here is that the record is then out of every tool's
// reach: the read tools do not show it, the delete tools report its name as
// not found, the add tools refuse it as missing, and creating an entity under
// its name stores a second record beside it instead of replacing it. Only an
// edit of the file by hand removes or repairs the line.
//
// The tests take no position on whether a remediation tool should exist. They
// state today's contract, and a change that adds one changes these assertions
// visibly.
//
// The claim is about tools, so each case drives the server through an SDK
// Client over an in-memory transport (helpers.ts) and asserts on the tool's
// result and on the file's exact bytes: the "not found" wording a client reads
// is produced in the tool handlers, which a call on KnowledgeGraphManager
// would skip. Every write tool is exercised, since the claim is "no tool".
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import { call, connect, makeTempGraph, readFileText } from "./helpers.js";
import type { Connection } from "./helpers.js";

const alice = {
  name: "Alice",
  entityType: "person",
  observations: ["Works at Acme"],
};
const bob = { name: "Bob", entityType: "person", observations: [] };
const carol = { name: "Carol", entityType: "person", observations: [] };
const aliceManagesBob = { from: "Alice", to: "Bob", relationType: "manages" };

const aliceLine = JSON.stringify({ type: "entity", ...alice });
const bobLine = JSON.stringify({ type: "entity", ...bob });
const carolLine = JSON.stringify({ type: "entity", ...carol });
const aliceManagesBobLine = JSON.stringify({
  type: "relation",
  ...aliceManagesBob,
});

// An entity record with no entityType, and a relation record with no
// relationType: each parses as JSON and fails its schema.
const invalidEntityLine =
  '{"type":"entity","name":"Broken","observations":["missing entityType"]}';
const invalidRelationLine = '{"type":"relation","from":"Alice","to":"Bob"}';

// In the order a save writes them (entities, relations, then the lines it
// could not read), so a save that changes nothing rewrites the same bytes.
const seedLines = [
  aliceLine,
  bobLine,
  aliceManagesBobLine,
  invalidEntityLine,
  invalidRelationLine,
];

function fileOf(lines: string[]): string {
  return lines.join("\n") + "\n";
}

describe("a schema-invalid record is out of every tool's reach (#5541)", () => {
  let filePath: string;
  let cleanup: () => Promise<void>;
  let conn: Connection;

  beforeEach(async () => {
    ({ filePath, cleanup } = await makeTempGraph());
    await fs.writeFile(filePath, fileOf(seedLines));
    // Every load logs "Skipping invalid entity/relation in memory file".
    vi.spyOn(console, "error").mockImplementation(() => {});
    conn = await connect(filePath);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await conn.close();
    await cleanup();
  });

  it("is not shown by read_graph, search_nodes or open_nodes", async () => {
    const { client } = conn;

    expect((await call(client, "read_graph")).structuredContent).toEqual({
      entities: [alice, bob],
      relations: [aliceManagesBob],
    });
    expect(
      (await call(client, "search_nodes", { query: "Broken" }))
        .structuredContent,
    ).toEqual({ entities: [], relations: [] });
    expect(
      (await call(client, "search_nodes", { query: "missing entityType" }))
        .structuredContent,
    ).toEqual({ entities: [], relations: [] });
    expect(
      (await call(client, "open_nodes", { names: ["Broken"] }))
        .structuredContent,
    ).toEqual({ entities: [], relations: [] });
    // Reading writes nothing.
    expect(await readFileText(filePath)).toBe(fileOf(seedLines));
  });

  it("is reported as not found by delete_entities, and outlives it and a later unrelated write", async () => {
    const { client } = conn;

    const deleted = await call(client, "delete_entities", {
      entityNames: ["Broken"],
    });

    expect(deleted.isError).toBeUndefined();
    expect(deleted.structuredContent).toEqual({
      success: true,
      message: "Deleted 0 of 1 entities. Not found: Broken",
    });
    expect(await readFileText(filePath)).toBe(fileOf(seedLines));

    await call(client, "create_entities", { entities: [carol] });

    expect(await readFileText(filePath)).toBe(
      fileOf([
        aliceLine,
        bobLine,
        carolLine,
        aliceManagesBobLine,
        invalidEntityLine,
        invalidRelationLine,
      ]),
    );
    expect((await call(client, "read_graph")).structuredContent).toEqual({
      entities: [alice, bob, carol],
      relations: [aliceManagesBob],
    });
  });

  it("keeps its observations when delete_observations names them", async () => {
    const result = await call(conn.client, "delete_observations", {
      deletions: [
        { entityName: "Broken", observations: ["missing entityType"] },
      ],
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      success: true,
      message: "Deleted 0 of 1 observations. Entities not found: Broken",
    });
    expect(await readFileText(filePath)).toBe(fileOf(seedLines));
  });

  it("is refused as missing by add_observations, so it cannot be repaired in place", async () => {
    const result = await call(conn.client, "add_observations", {
      observations: [{ entityName: "Broken", contents: ["a new fact"] }],
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "Entity with name Broken not found" },
    ]);
    expect(await readFileText(filePath)).toBe(fileOf(seedLines));
  });

  it("is refused as a relation's end by create_relations", async () => {
    const result = await call(conn.client, "create_relations", {
      relations: [{ from: "Alice", to: "Broken", relationType: "knows" }],
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "Entity with name Broken not found" },
    ]);
    expect(await readFileText(filePath)).toBe(fileOf(seedLines));
  });

  // create_entities does not see the invalid record, so the name is free: the
  // new entity is stored as a second record under the same name, and the
  // invalid line stays. Deleting by that name then removes only the new one.
  it("is not replaced by create_entities under its name, which adds a second record beside it", async () => {
    const { client } = conn;
    const replacement = {
      name: "Broken",
      entityType: "thing",
      observations: ["recreated"],
    };

    const created = await call(client, "create_entities", {
      entities: [replacement],
    });

    expect(created.structuredContent).toEqual({ entities: [replacement] });
    expect(await readFileText(filePath)).toBe(
      fileOf([
        aliceLine,
        bobLine,
        JSON.stringify({ type: "entity", ...replacement }),
        aliceManagesBobLine,
        invalidEntityLine,
        invalidRelationLine,
      ]),
    );

    const deleted = await call(client, "delete_entities", {
      entityNames: ["Broken"],
    });

    expect(deleted.structuredContent).toEqual({
      success: true,
      message: "Entities deleted successfully",
    });
    expect(await readFileText(filePath)).toBe(fileOf(seedLines));
  });

  describe("an invalid relation record", () => {
    // The record has no relationType, and delete_relations requires one, so
    // no call can name it: the same call without the field is rejected.
    it("matches no delete_relations call, whatever relationType is given", async () => {
      const { client } = conn;

      const unnamed = await call(client, "delete_relations", {
        relations: [{ from: "Alice", to: "Bob" }],
      });
      expect(unnamed.isError).toBe(true);
      expect(unnamed.content).toEqual([
        {
          type: "text",
          text: "Input validation error: Invalid arguments for tool delete_relations: relations.0.relationType: Invalid input: expected string, received undefined",
        },
      ]);

      const empty = await call(client, "delete_relations", {
        relations: [{ from: "Alice", to: "Bob", relationType: "" }],
      });
      expect(empty.structuredContent).toEqual({
        success: true,
        message: "Deleted 0 of 1 relations. The rest matched nothing.",
      });
      expect(await readFileText(filePath)).toBe(fileOf(seedLines));
    });

    // delete_entities removes every valid relation that touches the entity;
    // the invalid one that names it is left behind.
    it("is left behind when delete_entities removes both entities it names", async () => {
      const { client } = conn;

      const deleted = await call(client, "delete_entities", {
        entityNames: ["Alice", "Bob"],
      });

      expect(deleted.structuredContent).toEqual({
        success: true,
        message: "Entities deleted successfully",
      });
      expect(await readFileText(filePath)).toBe(
        fileOf([invalidEntityLine, invalidRelationLine]),
      );
      expect((await call(client, "read_graph")).structuredContent).toEqual({
        entities: [],
        relations: [],
      });
    });
  });
});
