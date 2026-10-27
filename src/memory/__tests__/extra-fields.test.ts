// Regression tests for #5058, driven through an SDK Client over an in-memory
// transport: members of a valid stored entity or relation record that the
// schema does not model (a createdAt written by an older version or another
// client, say) survive every write that keeps the record. Without that,
// create_entities, create_relations and add_observations would drop data they
// did not touch, while declaring destructiveHint: false. The extras stay out
// of every tool result, since the output schemas do not allow them.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { call, connect, makeTempGraph, readFileText } from "./helpers.js";
import type { Connection } from "./helpers.js";

// Extras of every JSON kind, nested ones included, and falsy values that a
// truthiness check would lose.
const aliceExtras = {
  createdAt: "2025-01-01T00:00:00Z",
  meta: { source: "import", tags: ["a", "b"], verified: false, rank: 0 },
  note: null,
};
const bobExtras = { createdAt: "2025-02-02T00:00:00Z" };
const relationExtras = { since: 2019, weight: [1, 2, { strong: true }] };

const alice = {
  name: "Alice",
  entityType: "person",
  observations: ["Works at Acme"],
};
const bob = { name: "Bob", entityType: "person", observations: [] };
const carol = { name: "Carol", entityType: "person", observations: [] };
const aliceManagesBob = { from: "Alice", to: "Bob", relationType: "manages" };
const bobKnowsAlice = { from: "Bob", to: "Alice", relationType: "knows" };

// The stored records, with the unknown members written before the modelled
// ones, as another client might order them.
const seedRecords = [
  { ...aliceExtras, type: "entity", ...alice },
  { type: "entity", ...bob, ...bobExtras },
  { type: "relation", ...aliceManagesBob, ...relationExtras },
];

describe("unmodelled fields on stored records (#5058)", () => {
  let filePath: string;
  let cleanup: () => Promise<void>;
  let conn: Connection | undefined;

  beforeEach(async () => {
    ({ filePath, cleanup } = await makeTempGraph());
    conn = undefined;
    await fs.writeFile(
      filePath,
      seedRecords.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
  });

  afterEach(async () => {
    await conn?.close();
    await cleanup();
  });

  async function open(): Promise<Connection> {
    conn = await connect(filePath);
    return conn;
  }

  // The graph file, one parsed record per line.
  async function records(): Promise<unknown[]> {
    return (await readFileText(filePath))
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as unknown);
  }

  const storedAlice = (observations = alice.observations) => ({
    type: "entity",
    ...alice,
    observations,
    ...aliceExtras,
  });
  const storedBob = { type: "entity", ...bob, ...bobExtras };
  const storedRelation = {
    type: "relation",
    ...aliceManagesBob,
    ...relationExtras,
  };

  it("writes the modelled fields first and the extras after them, unchanged", async () => {
    const { client } = await open();
    await call(client, "create_entities", { entities: [] });

    expect((await readFileText(filePath)).split("\n")).toEqual([
      '{"type":"entity","name":"Alice","entityType":"person","observations":["Works at Acme"],"createdAt":"2025-01-01T00:00:00Z","meta":{"source":"import","tags":["a","b"],"verified":false,"rank":0},"note":null}',
      '{"type":"entity","name":"Bob","entityType":"person","observations":[],"createdAt":"2025-02-02T00:00:00Z"}',
      '{"type":"relation","from":"Alice","to":"Bob","relationType":"manages","since":2019,"weight":[1,2,{"strong":true}]}',
      "",
    ]);
  });

  // Each additive call, empty, duplicate and effective, keeps every record's
  // extras, and a record it creates is written with none.
  it.each([
    ["an empty create_entities", "create_entities", { entities: [] }, []],
    [
      "a create_entities of an existing name",
      "create_entities",
      { entities: [alice] },
      [],
    ],
    [
      "a create_entities of a new entity",
      "create_entities",
      { entities: [carol] },
      [{ type: "entity", ...carol }],
    ],
    ["an empty create_relations", "create_relations", { relations: [] }, []],
    [
      "a create_relations of an existing relation",
      "create_relations",
      { relations: [aliceManagesBob] },
      [],
    ],
    [
      "a create_relations of a new relation",
      "create_relations",
      { relations: [bobKnowsAlice] },
      [{ type: "relation", ...bobKnowsAlice }],
    ],
    ["an empty add_observations", "add_observations", { observations: [] }, []],
    [
      "an add_observations of an existing observation",
      "add_observations",
      { observations: [{ entityName: "Alice", contents: ["Works at Acme"] }] },
      [],
    ],
  ])(
    "keeps them on %s",
    async (_label, tool, args, added: Record<string, unknown>[]) => {
      const { client } = await open();
      const result = await call(client, tool, args);
      expect(result.isError).toBeUndefined();

      const newEntities = added.filter((r) => r.type === "entity");
      const newRelations = added.filter((r) => r.type === "relation");
      expect(await records()).toEqual([
        storedAlice(),
        storedBob,
        ...newEntities,
        storedRelation,
        ...newRelations,
      ]);
    },
  );

  it("keeps them on an entity whose observations change, with the new observations", async () => {
    const { client } = await open();
    await call(client, "add_observations", {
      observations: [{ entityName: "Alice", contents: ["Likes tea"] }],
    });
    expect(await records()).toEqual([
      storedAlice(["Works at Acme", "Likes tea"]),
      storedBob,
      storedRelation,
    ]);

    await call(client, "delete_observations", {
      deletions: [{ entityName: "Alice", observations: ["Works at Acme"] }],
    });
    expect(await records()).toEqual([
      storedAlice(["Likes tea"]),
      storedBob,
      storedRelation,
    ]);
  });

  // A delete tool is destructive by declaration: a record it removes goes with
  // its extras, and the records it keeps keep theirs.
  it("drops them with a deleted entity and its relations, and keeps the rest", async () => {
    const { client } = await open();
    await call(client, "delete_entities", { entityNames: ["Bob"] });
    expect(await records()).toEqual([storedAlice()]);
  });

  it("drops them with a deleted relation, and keeps the entities'", async () => {
    const { client } = await open();
    await call(client, "delete_relations", { relations: [aliceManagesBob] });
    expect(await records()).toEqual([storedAlice(), storedBob]);
  });

  it("keeps them across a restart of the server", async () => {
    const first = await open();
    await call(first.client, "create_entities", { entities: [carol] });
    await first.close();
    conn = undefined;

    const { client } = await open();
    await call(client, "add_observations", { observations: [] });
    expect(await records()).toEqual([
      storedAlice(),
      storedBob,
      { type: "entity", ...carol },
      storedRelation,
    ]);
  });

  it("never returns them in a tool result", async () => {
    const { client } = await open();
    const graph = { entities: [alice, bob], relations: [aliceManagesBob] };

    expect((await call(client, "read_graph")).structuredContent).toEqual(graph);
    expect(
      (await call(client, "search_nodes", { query: "Alice" }))
        .structuredContent,
    ).toEqual({ entities: [alice], relations: [aliceManagesBob] });
    expect(
      (await call(client, "open_nodes", { names: ["Alice", "Bob"] }))
        .structuredContent,
    ).toEqual(graph);
  });

  // JSON.parse makes "__proto__" an ordinary member; it must be written back
  // as one, not set the prototype of the extras or of the written record.
  it("keeps a __proto__ member as data", async () => {
    const line =
      '{"type":"entity","name":"Dave","entityType":"person","observations":[],"__proto__":{"polluted":true}}';
    await fs.writeFile(filePath, line + "\n");
    const { client } = await open();

    await call(client, "create_entities", { entities: [] });

    expect(await readFileText(filePath)).toBe(line + "\n");
    expect((await call(client, "read_graph")).structuredContent).toEqual({
      entities: [{ name: "Dave", entityType: "person", observations: [] }],
      relations: [],
    });
  });
});
