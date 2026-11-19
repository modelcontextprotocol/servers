// Pins that a graph of thousands of records reads back exactly as written
// (#5540). This is a correctness test, not a benchmark: it asserts nothing
// about speed.
//
// Why it exists: the rest of this suite works on graphs of a few dozen
// records at most, so on small files. Here the file is about 600 KB, several
// times a 64 KiB stream chunk, written by ten full rewrites of a growing file
// and one more for the relations. A change that only breaks
// past a size no small test reaches would pass the rest of the suite: a
// default cap or page size on read_graph or search_nodes, a move from
// whole-file reads and writes to streamed ones that drops or splits a record
// at a chunk boundary (the observations hold multi-byte characters for that
// reason), or a rewrite that loses, duplicates or reorders records once a
// second batch lands on a large file.
//
// Why it goes through an MCP client rather than KnowledgeGraphManager: the
// place a default limit would be added is the tool layer, and the tool layer
// is also where a result this large meets the SDK's input and output schema
// validation and its JSON-RPC serialization. Driving the manager directly
// would leave all of that unpinned at scale. The reader is a second
// connection, so a second server with its own manager: it holds nothing the
// writer held in memory, which makes reading through it the equivalent of
// reading after a restart.
//
// Every record is compared, not a count and a sample: a count cannot see an
// observation attached to the wrong entity or a relation with a swapped
// endpoint.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, connect, makeTempGraph, readFileText } from "./helpers.js";
import type { Connection } from "./helpers.js";
import type { Entity, Relation } from "../index.js";

const ENTITY_COUNT = 5000;
const BATCH_SIZE = 500;
const RELATION_COUNT = 999;

// Zero-padded, so no name or observation is a substring of another and a
// search for one matches exactly one entity.
const pad = (n: number): string => String(n).padStart(4, "0");

const ENTITIES: Entity[] = Array.from({ length: ENTITY_COUNT }, (_, n) => ({
  name: `entity-${pad(n)}`,
  entityType: `bulk-${n % 7}`,
  observations: [`obs-${pad(n)}`, `観測 ${pad(n)} é`],
}));

// A chain over the first thousand entities: entity-0000 → entity-0001 → …
const RELATIONS: Relation[] = Array.from(
  { length: RELATION_COUNT },
  (_, n) => ({
    from: `entity-${pad(n)}`,
    to: `entity-${pad(n + 1)}`,
    relationType: "next",
  }),
);

// The setup makes eleven writes, each a full rewrite under the file lock.
// Measured on an Apple-silicon Mac, setup and all three tests together take
// 0.3 to 0.4 s, uninstrumented or under coverage (0.96 s once, on a loaded
// machine). The default 5 s hook timeout is too little headroom over that
// for a slow Windows runner (#5570); thirty seconds is a wide margin that
// still fails a write path whose cost has stopped being linear.
const SETUP_TIMEOUT_MS = 30_000;

describe("round trip at 5,000-entity scale", () => {
  let cleanup: () => Promise<void>;
  let filePath: string;
  let reader: Connection;

  beforeAll(async () => {
    const temp = await makeTempGraph();
    cleanup = temp.cleanup;
    filePath = temp.filePath;

    const writer = await connect(filePath);
    try {
      for (let start = 0; start < ENTITY_COUNT; start += BATCH_SIZE) {
        const batch = ENTITIES.slice(start, start + BATCH_SIZE);
        const created = await call(writer.client, "create_entities", {
          entities: batch,
        });
        // Each call reports exactly its own batch as created: nothing
        // skipped as a duplicate, nothing carried over from another batch.
        expect(created.isError).toBeFalsy();
        expect(created.structuredContent).toEqual({ entities: batch });
      }
      const created = await call(writer.client, "create_relations", {
        relations: RELATIONS,
      });
      expect(created.isError).toBeFalsy();
      expect(created.structuredContent).toEqual({ relations: RELATIONS });
    } finally {
      await writer.close();
    }

    reader = await connect(filePath);
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await reader?.close();
    await cleanup?.();
  });

  it("read_graph returns every entity and relation, in order, with no options", async () => {
    const result = await call(reader.client, "read_graph");

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      entities: ENTITIES,
      relations: RELATIONS,
    });
  });

  it("search_nodes finds the one entity holding an observation, with both relations that touch it", async () => {
    const result = await call(reader.client, "search_nodes", {
      query: "obs-0500",
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      entities: [ENTITIES[500]],
      relations: [RELATIONS[499], RELATIONS[500]],
    });
  });

  it("stores one record per line: the entities, then the relations", async () => {
    const lines = (await readFileText(filePath))
      .split("\n")
      .filter((line) => line !== "");

    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      ...ENTITIES.map((entity) => ({ type: "entity", ...entity })),
      ...RELATIONS.map((relation) => ({ type: "relation", ...relation })),
    ]);
  });
});
