// Characterization tests for the memory server's nine tools, driven through
// an SDK Client over an in-memory transport (#4854). They pin what a client
// sees today on SDK 1.x: the advertised tool list, each tool's text and
// structured results, and the error results. A test that pins a known bug
// cites its issue, so the PR that fixes it has a test to change.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { call, connect, makeTempGraph, textOf } from "./helpers.js";
import type { Connection } from "./helpers.js";

const DRAFT_07 = "http://json-schema.org/draft-07/schema#";

// JSON Schema fragments as the SDK emits them. Output schemas close every
// object with additionalProperties: false; input schemas leave them open.
function entityItem(closed: boolean) {
  return {
    type: "object",
    properties: {
      name: { type: "string", description: "The name of the entity" },
      entityType: { type: "string", description: "The type of the entity" },
      observations: {
        type: "array",
        items: { type: "string" },
        description:
          "An array of observation contents associated with the entity",
      },
    },
    required: ["name", "entityType", "observations"],
    ...(closed ? { additionalProperties: false } : {}),
  };
}

function relationItem(closed: boolean) {
  return {
    type: "object",
    properties: {
      from: {
        type: "string",
        description: "The name of the entity where the relation starts",
      },
      to: {
        type: "string",
        description: "The name of the entity where the relation ends",
      },
      relationType: { type: "string", description: "The type of the relation" },
    },
    required: ["from", "to", "relationType"],
    ...(closed ? { additionalProperties: false } : {}),
  };
}

const graphOutputSchema = {
  type: "object",
  properties: {
    entities: { type: "array", items: entityItem(true) },
    relations: { type: "array", items: relationItem(true) },
  },
  required: ["entities", "relations"],
  $schema: DRAFT_07,
  additionalProperties: false,
};

const statusOutputSchema = {
  type: "object",
  properties: { success: { type: "boolean" }, message: { type: "string" } },
  required: ["success", "message"],
  $schema: DRAFT_07,
  additionalProperties: false,
};

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
const deleteAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};
const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const execution = { taskSupport: "forbidden" };

const expectedTools = [
  {
    name: "create_entities",
    title: "Create Entities",
    description:
      "Create multiple new entities in the knowledge graph. An entity whose name already exists, or repeats an earlier entity in the same call, is skipped and its observations are not added; the result lists the skipped names in `skipped`. Use add_observations to add observations to an existing entity.",
    inputSchema: {
      type: "object",
      properties: { entities: { type: "array", items: entityItem(false) } },
      required: ["entities"],
      $schema: DRAFT_07,
    },
    outputSchema: {
      type: "object",
      properties: {
        entities: { type: "array", items: entityItem(true) },
        skipped: { type: "array", items: { type: "string" } },
      },
      required: ["entities"],
      $schema: DRAFT_07,
      additionalProperties: false,
    },
    annotations: writeAnnotations,
    execution,
  },
  {
    name: "create_relations",
    title: "Create Relations",
    description:
      "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
    inputSchema: {
      type: "object",
      properties: { relations: { type: "array", items: relationItem(false) } },
      required: ["relations"],
      $schema: DRAFT_07,
    },
    outputSchema: {
      type: "object",
      properties: { relations: { type: "array", items: relationItem(true) } },
      required: ["relations"],
      $schema: DRAFT_07,
      additionalProperties: false,
    },
    annotations: writeAnnotations,
    execution,
  },
  {
    name: "add_observations",
    title: "Add Observations",
    description:
      "Add new observations to existing entities in the knowledge graph",
    inputSchema: {
      type: "object",
      properties: {
        observations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entityName: {
                type: "string",
                description:
                  "The name of the entity to add the observations to",
              },
              contents: {
                type: "array",
                items: { type: "string" },
                description: "An array of observation contents to add",
              },
            },
            required: ["entityName", "contents"],
          },
        },
      },
      required: ["observations"],
      $schema: DRAFT_07,
    },
    outputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entityName: { type: "string" },
              addedObservations: { type: "array", items: { type: "string" } },
            },
            required: ["entityName", "addedObservations"],
            additionalProperties: false,
          },
        },
      },
      required: ["results"],
      $schema: DRAFT_07,
      additionalProperties: false,
    },
    annotations: writeAnnotations,
    execution,
  },
  {
    name: "delete_entities",
    title: "Delete Entities",
    description:
      "Delete multiple entities and their associated relations from the knowledge graph",
    inputSchema: {
      type: "object",
      properties: {
        entityNames: {
          type: "array",
          items: { type: "string" },
          description: "An array of entity names to delete",
        },
      },
      required: ["entityNames"],
      $schema: DRAFT_07,
    },
    outputSchema: statusOutputSchema,
    annotations: deleteAnnotations,
    execution,
  },
  {
    name: "delete_observations",
    title: "Delete Observations",
    description:
      "Delete specific observations from entities in the knowledge graph",
    inputSchema: {
      type: "object",
      properties: {
        deletions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entityName: {
                type: "string",
                description:
                  "The name of the entity containing the observations",
              },
              observations: {
                type: "array",
                items: { type: "string" },
                description: "An array of observations to delete",
              },
            },
            required: ["entityName", "observations"],
          },
        },
      },
      required: ["deletions"],
      $schema: DRAFT_07,
    },
    outputSchema: statusOutputSchema,
    annotations: deleteAnnotations,
    execution,
  },
  {
    name: "delete_relations",
    title: "Delete Relations",
    description: "Delete multiple relations from the knowledge graph",
    inputSchema: {
      type: "object",
      properties: {
        relations: {
          type: "array",
          items: relationItem(false),
          description: "An array of relations to delete",
        },
      },
      required: ["relations"],
      $schema: DRAFT_07,
    },
    outputSchema: statusOutputSchema,
    annotations: deleteAnnotations,
    execution,
  },
  {
    name: "read_graph",
    title: "Read Graph",
    description: "Read the entire knowledge graph",
    inputSchema: { type: "object", properties: {}, $schema: DRAFT_07 },
    outputSchema: graphOutputSchema,
    annotations: readAnnotations,
    execution,
  },
  {
    name: "search_nodes",
    title: "Search Nodes",
    description: "Search for nodes in the knowledge graph based on a query",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          maxLength: 2048,
          description:
            "The search query to match against entity names, types, and observation content",
        },
      },
      required: ["query"],
      $schema: DRAFT_07,
    },
    outputSchema: graphOutputSchema,
    annotations: readAnnotations,
    execution,
  },
  {
    name: "open_nodes",
    title: "Open Nodes",
    description: "Open specific nodes in the knowledge graph by their names",
    inputSchema: {
      type: "object",
      properties: {
        names: {
          type: "array",
          items: { type: "string" },
          description: "An array of entity names to retrieve",
        },
      },
      required: ["names"],
      $schema: DRAFT_07,
    },
    outputSchema: graphOutputSchema,
    annotations: readAnnotations,
    execution,
  },
];

const alice = {
  name: "Alice",
  entityType: "person",
  observations: ["works at Acme Corp", "likes tea"],
};
const bob = {
  name: "Bob",
  entityType: "person",
  observations: ["likes programming"],
};
const acme = {
  name: "Acme Corp",
  entityType: "organization",
  observations: ["makes anvils"],
};
const aliceKnowsBob = { from: "Alice", to: "Bob", relationType: "knows" };
const aliceWorksAtAcme = {
  from: "Alice",
  to: "Acme Corp",
  relationType: "works_at",
};

describe("memory tools over the protocol", () => {
  let conn: Connection;
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const graph = await makeTempGraph();
    cleanup = graph.cleanup;
    conn = await connect(graph.filePath);
    client = conn.client;
  });

  afterEach(async () => {
    await conn.close();
    await cleanup();
  });

  // Seed the graph with Alice, Bob and Acme Corp and two relations.
  async function seed() {
    await call(client, "create_entities", { entities: [alice, bob, acme] });
    await call(client, "create_relations", {
      relations: [aliceKnowsBob, aliceWorksAtAcme],
    });
  }

  async function readGraph() {
    return (await call(client, "read_graph")).structuredContent;
  }

  describe("server identity and tool list", () => {
    it("reports its name, the package version and its capabilities", async () => {
      expect(client.getServerVersion()).toEqual({
        name: "memory-server",
        version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      });
      expect(client.getServerCapabilities()).toEqual({
        resources: { subscribe: true, listChanged: true },
        tools: { listChanged: true },
      });
      expect(client.getInstructions()).toBeUndefined();
    });

    it("lists the nine tools with their schemas and annotations", async () => {
      const { tools } = await client.listTools();
      expect(tools).toEqual(expectedTools);
    });

    it("offers no prompts", async () => {
      await expect(client.listPrompts()).rejects.toThrow(/Method not found/);
    });

    it("reports an unknown tool as a tool error", async () => {
      const result = await call(client, "no_such_tool");
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "MCP error -32602: Tool no_such_tool not found",
          },
        ],
        isError: true,
      });
    });
  });

  describe("create_entities", () => {
    it("returns the created entities as text and structured content", async () => {
      const result = await call(client, "create_entities", {
        entities: [alice, bob],
      });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({ entities: [alice, bob] });
      expect(textOf(result)).toBe(JSON.stringify([alice, bob], null, 2));
      expect(await readGraph()).toEqual({
        entities: [alice, bob],
        relations: [],
      });
    });

    it("accepts an empty batch", async () => {
      const result = await call(client, "create_entities", { entities: [] });
      expect(result.structuredContent).toEqual({ entities: [] });
      expect(textOf(result)).toBe("[]");
    });

    it("keeps the first of two same-named entities in one batch and reports the second as skipped (#4887)", async () => {
      const second = { ...alice, entityType: "robot", observations: ["beeps"] };
      const result = await call(client, "create_entities", {
        entities: [alice, second],
      });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        entities: [alice],
        skipped: ["Alice"],
      });
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify([alice], null, 2) },
        {
          type: "text",
          text: "Skipped 1 entity that already exists: Alice. Its observations were not added; use add_observations for existing entities.",
        },
      ]);
      expect(await readGraph()).toEqual({ entities: [alice], relations: [] });
    });

    // #4887: create_entities still ignores an entity whose name already
    // exists, as documented, but now reports it as skipped so the caller
    // knows its observations were not stored.
    it("reports an entity that already exists as skipped (#4887)", async () => {
      await call(client, "create_entities", {
        entities: [
          {
            name: "Alice",
            entityType: "person",
            observations: ["Works at Acme"],
          },
        ],
      });

      const result = await call(client, "create_entities", {
        entities: [
          {
            name: "Alice",
            entityType: "person",
            observations: ["Allergic to penicillin"],
          },
          bob,
        ],
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        entities: [bob],
        skipped: ["Alice"],
      });
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify([bob], null, 2) },
        {
          type: "text",
          text: "Skipped 1 entity that already exists: Alice. Its observations were not added; use add_observations for existing entities.",
        },
      ]);
      const opened = await call(client, "open_nodes", { names: ["Alice"] });
      expect(opened.structuredContent).toEqual({
        entities: [
          {
            name: "Alice",
            entityType: "person",
            observations: ["Works at Acme"],
          },
        ],
        relations: [],
      });
    });

    it("rejects a call with no entities argument", async () => {
      const result = await call(client, "create_entities", {});
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "MCP error -32602: Input validation error: Invalid arguments for tool create_entities: Invalid input: expected array, received undefined at entities",
          },
        ],
        isError: true,
      });
    });

    it("rejects an entity missing its observations", async () => {
      const result = await call(client, "create_entities", {
        entities: [{ name: "Alice", entityType: "person" }],
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/Input validation error/);
      expect(await readGraph()).toEqual({ entities: [], relations: [] });
    });

    it("keeps every entity when many calls run concurrently", async () => {
      const names = Array.from({ length: 20 }, (_, i) => `entity-${i}`);
      await Promise.all(
        names.map((name) =>
          call(client, "create_entities", {
            entities: [{ name, entityType: "thing", observations: [] }],
          }),
        ),
      );
      const graph = (await readGraph()) as { entities: { name: string }[] };
      expect(graph.entities.map((e) => e.name).sort()).toEqual(
        [...names].sort(),
      );
    });
  });

  describe("create_relations", () => {
    beforeEach(async () => {
      await call(client, "create_entities", { entities: [alice, bob, acme] });
    });

    it("returns the created relations as text and structured content", async () => {
      const result = await call(client, "create_relations", {
        relations: [aliceKnowsBob, aliceWorksAtAcme],
      });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        relations: [aliceKnowsBob, aliceWorksAtAcme],
      });
      expect(textOf(result)).toBe(
        JSON.stringify([aliceKnowsBob, aliceWorksAtAcme], null, 2),
      );
    });

    it("skips relations that already exist or repeat within the batch", async () => {
      await call(client, "create_relations", { relations: [aliceKnowsBob] });
      const result = await call(client, "create_relations", {
        relations: [aliceKnowsBob, aliceWorksAtAcme, aliceWorksAtAcme],
      });
      expect(result.structuredContent).toEqual({
        relations: [aliceWorksAtAcme],
      });
      expect(await readGraph()).toEqual({
        entities: [alice, bob, acme],
        relations: [aliceKnowsBob, aliceWorksAtAcme],
      });
    });

    it("treats a different relation type between the same pair as new", async () => {
      const aliceManagesBob = { ...aliceKnowsBob, relationType: "manages" };
      await call(client, "create_relations", { relations: [aliceKnowsBob] });
      const result = await call(client, "create_relations", {
        relations: [aliceManagesBob],
      });
      expect(result.structuredContent).toEqual({
        relations: [aliceManagesBob],
      });
    });

    it("fails the whole batch when a source entity is missing", async () => {
      const result = await call(client, "create_relations", {
        relations: [
          aliceKnowsBob,
          { from: "Zed", to: "Bob", relationType: "x" },
        ],
      });
      expect(result).toEqual({
        content: [{ type: "text", text: "Entity with name Zed not found" }],
        isError: true,
      });
      expect(await readGraph()).toEqual({
        entities: [alice, bob, acme],
        relations: [],
      });
    });

    it("fails the whole batch when a target entity is missing", async () => {
      const result = await call(client, "create_relations", {
        relations: [{ from: "Alice", to: "Zed", relationType: "x" }],
      });
      expect(result).toEqual({
        content: [{ type: "text", text: "Entity with name Zed not found" }],
        isError: true,
      });
    });
  });

  describe("add_observations", () => {
    beforeEach(async () => {
      await call(client, "create_entities", { entities: [alice, bob] });
    });

    it("adds only observations the entity does not already have", async () => {
      const result = await call(client, "add_observations", {
        observations: [
          { entityName: "Alice", contents: ["likes tea", "plays chess"] },
          { entityName: "Bob", contents: ["likes programming"] },
        ],
      });
      const expected = [
        { entityName: "Alice", addedObservations: ["plays chess"] },
        { entityName: "Bob", addedObservations: [] },
      ];
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({ results: expected });
      expect(textOf(result)).toBe(JSON.stringify(expected, null, 2));
      expect(await readGraph()).toEqual({
        entities: [
          { ...alice, observations: [...alice.observations, "plays chess"] },
          bob,
        ],
        relations: [],
      });
    });

    it("fails the whole batch, saving nothing, when an entity is missing", async () => {
      const result = await call(client, "add_observations", {
        observations: [
          { entityName: "Alice", contents: ["plays chess"] },
          { entityName: "Zed", contents: ["unknown"] },
        ],
      });
      expect(result).toEqual({
        content: [{ type: "text", text: "Entity with name Zed not found" }],
        isError: true,
      });
      expect(await readGraph()).toEqual({
        entities: [alice, bob],
        relations: [],
      });
    });
  });

  describe("delete_entities", () => {
    beforeEach(seed);

    it("deletes the entities and every relation that touches them", async () => {
      const result = await call(client, "delete_entities", {
        entityNames: ["Alice"],
      });
      const message = "Entities deleted successfully";
      expect(result).toEqual({
        content: [{ type: "text", text: message }],
        structuredContent: { success: true, message },
      });
      expect(await readGraph()).toEqual({
        entities: [bob, acme],
        relations: [],
      });
    });

    it("names the entities it did not find, still reporting success", async () => {
      const result = await call(client, "delete_entities", {
        entityNames: ["Bob", "Zed", "Yan"],
      });
      const message = "Deleted 1 of 3 entities. Not found: Zed, Yan";
      expect(result).toEqual({
        content: [{ type: "text", text: message }],
        structuredContent: { success: true, message },
      });
      expect(await readGraph()).toEqual({
        entities: [alice, acme],
        relations: [aliceWorksAtAcme],
      });
    });
  });

  describe("delete_entities when nothing matches", () => {
    beforeEach(seed);

    it("reports nothing deleted and leaves the graph unchanged", async () => {
      const result = await call(client, "delete_entities", {
        entityNames: ["Nobody"],
      });
      const message = "Deleted 0 of 1 entities. Not found: Nobody";
      expect(result).toEqual({
        content: [{ type: "text", text: message }],
        structuredContent: { success: true, message },
      });
      expect(await readGraph()).toEqual({
        entities: [alice, bob, acme],
        relations: [aliceKnowsBob, aliceWorksAtAcme],
      });
    });
  });

  describe("delete_observations", () => {
    beforeEach(seed);

    it("reports success when every requested observation was removed", async () => {
      const result = await call(client, "delete_observations", {
        deletions: [{ entityName: "Alice", observations: ["likes tea"] }],
      });
      const message = "Observations deleted successfully";
      expect(result).toEqual({
        content: [{ type: "text", text: message }],
        structuredContent: { success: true, message },
      });
      expect(await call(client, "open_nodes", { names: ["Alice"] })).toEqual(
        expect.objectContaining({
          structuredContent: {
            entities: [{ ...alice, observations: ["works at Acme Corp"] }],
            relations: [aliceKnowsBob, aliceWorksAtAcme],
          },
        }),
      );
    });

    it("counts observations that were not there", async () => {
      const result = await call(client, "delete_observations", {
        deletions: [
          { entityName: "Alice", observations: ["likes tea", "never said"] },
        ],
      });
      const message = "Deleted 1 of 2 observations.";
      expect(result).toEqual({
        content: [{ type: "text", text: message }],
        structuredContent: { success: true, message },
      });
    });

    it("names entities that do not exist", async () => {
      const result = await call(client, "delete_observations", {
        deletions: [
          { entityName: "Bob", observations: ["likes programming"] },
          { entityName: "Zed", observations: ["a", "b"] },
        ],
      });
      const message = "Deleted 1 of 3 observations. Entities not found: Zed";
      expect(result).toEqual({
        content: [{ type: "text", text: message }],
        structuredContent: { success: true, message },
      });
    });
  });

  describe("delete_relations", () => {
    beforeEach(seed);

    it("reports success when every requested relation was removed", async () => {
      const result = await call(client, "delete_relations", {
        relations: [aliceKnowsBob],
      });
      const message = "Relations deleted successfully";
      expect(result).toEqual({
        content: [{ type: "text", text: message }],
        structuredContent: { success: true, message },
      });
      expect(await readGraph()).toEqual({
        entities: [alice, bob, acme],
        relations: [aliceWorksAtAcme],
      });
    });

    it("deletes nothing when only the relation type differs", async () => {
      const result = await call(client, "delete_relations", {
        relations: [{ ...aliceKnowsBob, relationType: "manages" }],
      });
      const message = "Deleted 0 of 1 relations. The rest matched nothing.";
      expect(result).toEqual({
        content: [{ type: "text", text: message }],
        structuredContent: { success: true, message },
      });
      expect(await readGraph()).toEqual({
        entities: [alice, bob, acme],
        relations: [aliceKnowsBob, aliceWorksAtAcme],
      });
    });

    it("counts relations that matched nothing", async () => {
      const result = await call(client, "delete_relations", {
        relations: [aliceKnowsBob, { ...aliceKnowsBob, relationType: "likes" }],
      });
      const message = "Deleted 1 of 2 relations. The rest matched nothing.";
      expect(result).toEqual({
        content: [{ type: "text", text: message }],
        structuredContent: { success: true, message },
      });
    });
  });

  describe("read_graph", () => {
    it("returns an empty graph when the file does not exist yet", async () => {
      const result = await call(client, "read_graph");
      const empty = { entities: [], relations: [] };
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify(empty, null, 2) }],
        structuredContent: empty,
      });
    });

    it("returns every entity and relation", async () => {
      await seed();
      const result = await call(client, "read_graph");
      const graph = {
        entities: [alice, bob, acme],
        relations: [aliceKnowsBob, aliceWorksAtAcme],
      };
      expect(result.structuredContent).toEqual(graph);
      expect(textOf(result)).toBe(JSON.stringify(graph, null, 2));
    });
  });

  describe("search_nodes", () => {
    beforeEach(seed);

    async function search(query: string) {
      return (await call(client, "search_nodes", { query })).structuredContent;
    }

    it("matches entity names, and returns relations touching any match", async () => {
      const result = await call(client, "search_nodes", { query: "bob" });
      const graph = { entities: [bob], relations: [aliceKnowsBob] };
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify(graph, null, 2) }],
        structuredContent: graph,
      });
    });

    it("matches entity types", async () => {
      expect(await search("ORGANIZATION")).toEqual({
        entities: [acme],
        relations: [aliceWorksAtAcme],
      });
    });

    it("matches observation content, case-insensitively", async () => {
      expect(await search("ANVIL")).toEqual({
        entities: [acme],
        relations: [aliceWorksAtAcme],
      });
    });

    it("matches the whole query as one substring", async () => {
      expect(await search("person")).toEqual({
        entities: [alice, bob],
        relations: [aliceKnowsBob, aliceWorksAtAcme],
      });
      expect(await search("Alice tea")).toEqual({
        entities: [],
        relations: [],
      });
    });

    it("accepts a query of exactly 2048 characters", async () => {
      const result = await call(client, "search_nodes", {
        query: "a".repeat(2048),
      });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({ entities: [], relations: [] });
    });

    it("rejects a query that is not a string", async () => {
      const result = await call(client, "search_nodes", { query: 42 });
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "MCP error -32602: Input validation error: Invalid arguments for tool search_nodes: Invalid input: expected string, received number at query",
          },
        ],
        isError: true,
      });
    });

    it("rejects a query longer than 2048 characters", async () => {
      const result = await call(client, "search_nodes", {
        query: "a".repeat(2049),
      });
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "MCP error -32602: Input validation error: Invalid arguments for tool search_nodes: Too big: expected string to have <=2048 characters at query",
          },
        ],
        isError: true,
      });
    });
  });

  describe("open_nodes", () => {
    beforeEach(seed);

    it("returns the named entities and every relation touching them", async () => {
      const result = await call(client, "open_nodes", { names: ["Bob"] });
      const graph = { entities: [bob], relations: [aliceKnowsBob] };
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify(graph, null, 2) }],
        structuredContent: graph,
      });
    });

    it("matches names exactly and ignores names that do not exist", async () => {
      const result = await call(client, "open_nodes", {
        names: ["alice", "Acme Corp", "Zed"],
      });
      expect(result.structuredContent).toEqual({
        entities: [acme],
        relations: [aliceWorksAtAcme],
      });
    });

    it("returns an empty graph for an empty list", async () => {
      const result = await call(client, "open_nodes", { names: [] });
      expect(result.structuredContent).toEqual({ entities: [], relations: [] });
    });
  });
});
