// Tests for the read tools' optional inputs (#3953), driven through an SDK
// Client over an in-memory transport: read_graph's entityTypes filter, the
// observationLimit every read tool takes (with the observationCount it adds),
// and search_nodes' limit. Each option is optional, so the default results
// are pinned too: a call without them returns what it always has, and the
// knowledge-graph resource never carries observationCount.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/client";
import { call, connect, makeTempGraph, textOf } from "./helpers.js";
import type { Connection } from "./helpers.js";

const alice = {
  name: "Alice",
  entityType: "person",
  observations: ["works at Acme Corp", "likes tea", "plays chess"],
};
const bob = {
  name: "Bob",
  entityType: "person",
  observations: ["likes programming"],
};
const acme = {
  name: "Acme Corp",
  entityType: "organization",
  observations: ["makes anvils", "founded in 1900"],
};
const empty = { name: "Nobody", entityType: "placeholder", observations: [] };
const aliceKnowsBob = { from: "Alice", to: "Bob", relationType: "knows" };
const aliceWorksAtAcme = {
  from: "Alice",
  to: "Acme Corp",
  relationType: "works_at",
};
const bobKnowsAlice = { from: "Bob", to: "Alice", relationType: "knows" };

describe("read tool options (#3953)", () => {
  let conn: Connection;
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const graph = await makeTempGraph();
    cleanup = graph.cleanup;
    conn = await connect(graph.filePath);
    client = conn.client;
    await call(client, "create_entities", {
      entities: [alice, bob, acme, empty],
    });
    await call(client, "create_relations", {
      relations: [aliceKnowsBob, aliceWorksAtAcme, bobKnowsAlice],
    });
  });

  afterEach(async () => {
    await conn.close();
    await cleanup();
  });

  // Call a tool and return its structured result, checking that the text
  // block carries the same graph.
  async function read(name: string, args: Record<string, unknown>) {
    const result = await call(client, name, args);
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      JSON.stringify(result.structuredContent, null, 2),
    );
    return result.structuredContent;
  }

  // The text of a call that must fail input validation.
  async function rejected(name: string, args: Record<string, unknown>) {
    const result = await call(client, name, args);
    expect(result.isError).toBe(true);
    return textOf(result);
  }

  describe("defaults", () => {
    it("read_graph without options returns every observation and no counts", async () => {
      expect(await read("read_graph", {})).toEqual({
        entities: [alice, bob, acme, empty],
        relations: [aliceKnowsBob, aliceWorksAtAcme, bobKnowsAlice],
      });
    });

    it("search_nodes and open_nodes without options return full entities", async () => {
      expect(await read("search_nodes", { query: "acme" })).toEqual({
        entities: [alice, acme],
        relations: [aliceKnowsBob, aliceWorksAtAcme, bobKnowsAlice],
      });
      expect(await read("open_nodes", { names: ["Bob"] })).toEqual({
        entities: [bob],
        relations: [aliceKnowsBob, bobKnowsAlice],
      });
    });

    it("the knowledge-graph resource is unaffected", async () => {
      const { contents } = await client.readResource({
        uri: "memory://knowledge-graph",
      });
      const [content] = contents;
      expect("text" in content && JSON.parse(content.text)).toEqual({
        entities: [alice, bob, acme, empty],
        relations: [aliceKnowsBob, aliceWorksAtAcme, bobKnowsAlice],
      });
    });
  });

  describe("observationLimit", () => {
    it("0 gives read_graph an overview of names, types and counts", async () => {
      expect(await read("read_graph", { observationLimit: 0 })).toEqual({
        entities: [
          { ...alice, observations: [], observationCount: 3 },
          { ...bob, observations: [], observationCount: 1 },
          { ...acme, observations: [], observationCount: 2 },
          { ...empty, observationCount: 0 },
        ],
        relations: [aliceKnowsBob, aliceWorksAtAcme, bobKnowsAlice],
      });
    });

    it("keeps the first observations, in the order they were added", async () => {
      expect(await read("read_graph", { observationLimit: 2 })).toEqual({
        entities: [
          {
            ...alice,
            observations: ["works at Acme Corp", "likes tea"],
            observationCount: 3,
          },
          { ...bob, observationCount: 1 },
          { ...acme, observationCount: 2 },
          { ...empty, observationCount: 0 },
        ],
        relations: [aliceKnowsBob, aliceWorksAtAcme, bobKnowsAlice],
      });
    });

    it("applies to search_nodes", async () => {
      expect(
        await read("search_nodes", { query: "acme", observationLimit: 1 }),
      ).toEqual({
        entities: [
          {
            ...alice,
            observations: ["works at Acme Corp"],
            observationCount: 3,
          },
          { ...acme, observations: ["makes anvils"], observationCount: 2 },
        ],
        relations: [aliceKnowsBob, aliceWorksAtAcme, bobKnowsAlice],
      });
    });

    it("applies to open_nodes", async () => {
      expect(
        await read("open_nodes", {
          names: ["Alice", "Missing"],
          observationLimit: 1,
        }),
      ).toEqual({
        entities: [
          {
            ...alice,
            observations: ["works at Acme Corp"],
            observationCount: 3,
          },
        ],
        relations: [aliceKnowsBob, aliceWorksAtAcme, bobKnowsAlice],
      });
    });

    it.each([
      ["read_graph", {}],
      ["search_nodes", { query: "a" }],
      ["open_nodes", { names: ["Alice"] }],
    ])("%s rejects a negative or fractional limit", async (name, args) => {
      expect(await rejected(name, { ...args, observationLimit: -1 })).toContain(
        "observationLimit",
      );
      expect(
        await rejected(name, { ...args, observationLimit: 1.5 }),
      ).toContain("observationLimit");
    });
  });

  describe("read_graph entityTypes", () => {
    it("keeps entities of the given types and the relations that touch them", async () => {
      expect(
        await read("read_graph", { entityTypes: ["organization"] }),
      ).toEqual({
        entities: [acme],
        relations: [aliceWorksAtAcme],
      });
    });

    it("accepts several types, and combines with observationLimit", async () => {
      expect(
        await read("read_graph", {
          entityTypes: ["organization", "placeholder"],
          observationLimit: 0,
        }),
      ).toEqual({
        entities: [
          { ...acme, observations: [], observationCount: 2 },
          { ...empty, observationCount: 0 },
        ],
        relations: [aliceWorksAtAcme],
      });
    });

    it("matches types exactly", async () => {
      expect(await read("read_graph", { entityTypes: ["Person"] })).toEqual({
        entities: [],
        relations: [],
      });
    });

    it("rejects an empty list", async () => {
      expect(await rejected("read_graph", { entityTypes: [] })).toContain(
        "entityTypes",
      );
    });
  });

  describe("search_nodes limit", () => {
    it("keeps the first matches and the relations that touch them", async () => {
      expect(await read("search_nodes", { query: "acme", limit: 1 })).toEqual({
        entities: [alice],
        relations: [aliceKnowsBob, aliceWorksAtAcme, bobKnowsAlice],
      });
      expect(await read("search_nodes", { query: "o", limit: 2 })).toEqual({
        entities: [alice, bob],
        relations: [aliceKnowsBob, aliceWorksAtAcme, bobKnowsAlice],
      });
    });

    it("returns every match when the limit exceeds them", async () => {
      expect(await read("search_nodes", { query: "acme", limit: 10 })).toEqual({
        entities: [alice, acme],
        relations: [aliceKnowsBob, aliceWorksAtAcme, bobKnowsAlice],
      });
    });

    it("rejects a limit below 1", async () => {
      expect(
        await rejected("search_nodes", { query: "a", limit: 0 }),
      ).toContain("limit");
    });
  });
});
