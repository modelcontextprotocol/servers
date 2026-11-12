// Tests for the opt-in write limits (#5525): MEMORY_MAX_ENTITIES,
// MEMORY_MAX_RELATIONS and MEMORY_MAX_FILE_BYTES. graphLimitsFromEnv() is
// tested directly for its parsing; the limits themselves are driven through an
// SDK Client over an in-memory transport, asserting on the tool result and on
// the graph file, which a refused call must leave byte for byte unchanged.
// The last blocks show the limits reach the Streamable HTTP endpoint, and
// that main() reads them from the environment.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import {
  Client,
  InMemoryTransport,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { GRAPH_LIMIT_ENV, graphLimitsFromEnv, main } from "../index.js";
import type { GraphLimits } from "../index.js";
import { startHttpServer } from "../http.js";
import {
  call,
  connect,
  makeTempGraph,
  readFileText,
  textOf,
} from "./helpers.js";

const entity = (name: string, observations: string[] = []) => ({
  name,
  entityType: "person",
  observations,
});

describe("graphLimitsFromEnv", () => {
  it("leaves every limit off when nothing is set", () => {
    expect(graphLimitsFromEnv({})).toEqual({});
  });

  it("refuses an empty or blank variable rather than treating it as unset", () => {
    expect(() => graphLimitsFromEnv({ MEMORY_MAX_ENTITIES: "" })).toThrow(
      'MEMORY_MAX_ENTITIES must be a positive whole number, got ""',
    );
    expect(() => graphLimitsFromEnv({ MEMORY_MAX_RELATIONS: "  " })).toThrow(
      'MEMORY_MAX_RELATIONS must be a positive whole number, got "  "',
    );
  });

  it("reads each limit from its variable, trimming whitespace", () => {
    expect(
      graphLimitsFromEnv({
        MEMORY_MAX_ENTITIES: "100",
        MEMORY_MAX_RELATIONS: " 200 ",
        MEMORY_MAX_FILE_BYTES: "1048576",
      }),
    ).toEqual({ maxEntities: 100, maxRelations: 200, maxFileBytes: 1048576 });
  });

  it.each([
    "0",
    "-1",
    "1.5",
    "1e3",
    "abc",
    "10 MB",
    "0x10",
    "99999999999999999999",
  ])("refuses %j, naming the variable", (value) => {
    expect(() => graphLimitsFromEnv({ MEMORY_MAX_FILE_BYTES: value })).toThrow(
      `MEMORY_MAX_FILE_BYTES must be a positive whole number, got "${value}"`,
    );
  });

  it("names every variable in GRAPH_LIMIT_ENV", () => {
    expect(Object.values(GRAPH_LIMIT_ENV)).toEqual([
      "MEMORY_MAX_ENTITIES",
      "MEMORY_MAX_RELATIONS",
      "MEMORY_MAX_FILE_BYTES",
    ]);
  });
});

describe("write limits", () => {
  let filePath: string;
  let cleanup: () => Promise<void>;
  const open: { close: () => Promise<void> }[] = [];

  beforeEach(async () => {
    ({ filePath, cleanup } = await makeTempGraph());
  });

  afterEach(async () => {
    for (const conn of open.splice(0)) {
      await conn.close();
    }
    await cleanup();
  });

  async function clientWith(limits: GraphLimits): Promise<Client> {
    const conn = await connect(filePath, limits);
    open.push(conn);
    return conn.client;
  }

  // A refused call: an error result naming the variable, and no write.
  async function expectRefused(
    result: Promise<CallToolResult>,
    variable: string,
    before: string,
  ): Promise<void> {
    const refused = await result;
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toMatch(/^Refused: /);
    expect(textOf(refused)).toContain(`set by ${variable}`);
    expect(textOf(refused)).toContain("Nothing was saved");
    expect(await readFileText(filePath)).toBe(before);
  }

  it("changes nothing when no limit is set", async () => {
    const client = await clientWith({});
    const result = await call(client, "create_entities", {
      entities: [entity("A"), entity("B"), entity("C")],
    });
    expect(result.isError).toBeUndefined();
  });

  describe("MEMORY_MAX_ENTITIES", () => {
    it("allows creating up to the limit and refuses the call that passes it", async () => {
      const client = await clientWith({ maxEntities: 2 });
      const ok = await call(client, "create_entities", {
        entities: [entity("A"), entity("B")],
      });
      expect(ok.isError).toBeUndefined();
      const before = await readFileText(filePath);

      await expectRefused(
        call(client, "create_entities", { entities: [entity("C")] }),
        "MEMORY_MAX_ENTITIES",
        before,
      );
    });

    it("refuses the whole call, not just the entities past the limit", async () => {
      const client = await clientWith({ maxEntities: 2 });
      await call(client, "create_entities", { entities: [entity("A")] });
      const before = await readFileText(filePath);

      await expectRefused(
        call(client, "create_entities", {
          entities: [entity("B"), entity("C")],
        }),
        "MEMORY_MAX_ENTITIES",
        before,
      );
    });

    it("still answers a call that adds nothing once the graph is full", async () => {
      const client = await clientWith({ maxEntities: 1 });
      await call(client, "create_entities", { entities: [entity("A")] });

      const result = await call(client, "create_entities", {
        entities: [entity("A")],
      });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        entities: [],
        skipped: ["A"],
      });
    });

    it("lets a graph already over a lowered limit shrink, and refuses its growth", async () => {
      const unlimited = await clientWith({});
      await call(unlimited, "create_entities", {
        entities: [entity("A"), entity("B"), entity("C")],
      });

      const client = await clientWith({ maxEntities: 1 });
      const before = await readFileText(filePath);
      await expectRefused(
        call(client, "create_entities", { entities: [entity("D")] }),
        "MEMORY_MAX_ENTITIES",
        before,
      );

      // Growth on another dimension is not refused by this one.
      const observed = await call(client, "add_observations", {
        observations: [{ entityName: "A", contents: ["likes tea"] }],
      });
      expect(observed.isError).toBeUndefined();

      const deleted = await call(client, "delete_entities", {
        entityNames: ["B"],
      });
      expect(deleted.isError).toBeUndefined();
      expect(await readFileText(filePath)).not.toContain('"name":"B"');
    });
  });

  describe("MEMORY_MAX_RELATIONS", () => {
    it("allows relations up to the limit and refuses the one that passes it", async () => {
      const client = await clientWith({ maxRelations: 1 });
      await call(client, "create_entities", {
        entities: [entity("A"), entity("B")],
      });
      const ok = await call(client, "create_relations", {
        relations: [{ from: "A", to: "B", relationType: "knows" }],
      });
      expect(ok.isError).toBeUndefined();
      const before = await readFileText(filePath);

      await expectRefused(
        call(client, "create_relations", {
          relations: [{ from: "B", to: "A", relationType: "knows" }],
        }),
        "MEMORY_MAX_RELATIONS",
        before,
      );

      // A repeat of a stored relation adds nothing, so it is still answered.
      const repeat = await call(client, "create_relations", {
        relations: [{ from: "A", to: "B", relationType: "knows" }],
      });
      expect(repeat.isError).toBeUndefined();
      expect(repeat.structuredContent).toEqual({ relations: [] });
    });
  });

  describe("MEMORY_MAX_FILE_BYTES", () => {
    it("refuses add_observations that would grow the file past the limit", async () => {
      const unlimited = await clientWith({});
      await call(unlimited, "create_entities", { entities: [entity("A")] });
      const before = await readFileText(filePath);
      const size = Buffer.byteLength(before, "utf-8");

      // Room for a short observation, not a long one.
      const client = await clientWith({ maxFileBytes: size + 20 });
      const ok = await call(client, "add_observations", {
        observations: [{ entityName: "A", contents: ["short"] }],
      });
      expect(ok.isError).toBeUndefined();
      const afterShort = await readFileText(filePath);

      await expectRefused(
        call(client, "add_observations", {
          observations: [{ entityName: "A", contents: ["x".repeat(100)] }],
        }),
        "MEMORY_MAX_FILE_BYTES",
        afterShort,
      );
    });

    it("counts bytes, not characters", async () => {
      const unlimited = await clientWith({});
      await call(unlimited, "create_entities", { entities: [entity("A")] });
      const size = Buffer.byteLength(await readFileText(filePath), "utf-8");

      // Ten emoji add 42 bytes to the file (each is 4 bytes in UTF-8, plus
      // the quotes) but only 22 UTF-16 code units, so a budget of 30 fits
      // them only if the cap counted string length rather than bytes.
      const client = await clientWith({ maxFileBytes: size + 30 });
      await expectRefused(
        call(client, "add_observations", {
          observations: [{ entityName: "A", contents: ["😀".repeat(10)] }],
        }),
        "MEMORY_MAX_FILE_BYTES",
        await readFileText(filePath),
      );
    });

    it("answers a call that adds nothing even when re-saving grows the file", async () => {
      // A record with no final newline: the save writes it back with one, a
      // byte larger than the limit, though nothing was added.
      const record =
        '{"type":"entity","name":"A","entityType":"person","observations":["x"]}';
      await fs.writeFile(filePath, record);
      const client = await clientWith({
        maxFileBytes: Buffer.byteLength(record, "utf-8"),
      });

      const entities = await call(client, "create_entities", {
        entities: [entity("A")],
      });
      expect(entities.isError).toBeUndefined();
      const observations = await call(client, "add_observations", {
        observations: [{ entityName: "A", contents: ["x"] }],
      });
      expect(observations.isError).toBeUndefined();
    });

    it("refuses the first write to a new file that would already be too large", async () => {
      const client = await clientWith({ maxFileBytes: 10 });
      const refused = await call(client, "create_entities", {
        entities: [entity("A")],
      });
      expect(refused.isError).toBe(true);
      expect(textOf(refused)).toContain("set by MEMORY_MAX_FILE_BYTES");
      await expect(readFileText(filePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });
});

describe("write limits over Streamable HTTP", () => {
  it("holds the endpoint's write tools to the limits it was given", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { filePath, cleanup } = await makeTempGraph();
    const running = await startHttpServer(
      filePath,
      { host: "127.0.0.1", port: 0 },
      { maxEntities: 1 },
    );
    const client = new Client({ name: "http-test", version: "0.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(running.url)),
      );
      const ok = await call(client, "create_entities", {
        entities: [entity("A")],
      });
      expect(ok.isError).toBeUndefined();
      const refused = await call(client, "create_entities", {
        entities: [entity("B")],
      });
      expect(refused.isError).toBe(true);
      expect(textOf(refused)).toContain("set by MEMORY_MAX_ENTITIES");
    } finally {
      await client.close();
      await running.close();
      await cleanup();
      vi.restoreAllMocks();
    }
  });
});

describe("main reads the limits from the environment", () => {
  const saved: Record<string, string | undefined> = {};
  const names = ["MEMORY_FILE_PATH", ...Object.values(GRAPH_LIMIT_ENV)];
  let dir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    for (const name of names) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    ({ dir, cleanup } = await makeTempGraph());
    process.env.MEMORY_FILE_PATH = path.join(dir, "memory.jsonl");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    for (const name of names) {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    }
    vi.restoreAllMocks();
    await cleanup();
  });

  it("enforces MEMORY_MAX_ENTITIES on the server it starts", async () => {
    process.env.MEMORY_MAX_ENTITIES = "1";
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "memory-test-client", version: "0.0.0" });
    const server = await main(serverTransport);
    await client.connect(clientTransport);
    try {
      const ok = await call(client, "create_entities", {
        entities: [entity("A")],
      });
      expect(ok.isError).toBeUndefined();
      const refused = await call(client, "create_entities", {
        entities: [entity("B")],
      });
      expect(refused.isError).toBe(true);
      expect(textOf(refused)).toContain("set by MEMORY_MAX_ENTITIES");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("refuses to start on an invalid limit", async () => {
    process.env.MEMORY_MAX_RELATIONS = "lots";
    await expect(main(InMemoryTransport.createLinkedPair()[1])).rejects.toThrow(
      'MEMORY_MAX_RELATIONS must be a positive whole number, got "lots"',
    );
  });
});
