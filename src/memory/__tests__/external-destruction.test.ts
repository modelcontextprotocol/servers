// Characterization tests for the graph file being destroyed from outside the
// server between two operations (#5539): deleted, truncated to zero bytes,
// replaced by a directory, or joined by the temp remnant of a killed run.
// The other suites pin these states only as a server finds them at its first
// call (no file yet, a directory at the path) or as a save fails from inside
// (a mocked write or rename). Here one server stays connected across the
// change, so each case also pins that nothing read before it is served or
// written back afterwards.
//
// Driven through an SDK Client over the in-memory transport rather than
// KnowledgeGraphManager directly, as the issue proposed: what these cases
// promise is what a client is told (an empty graph, or a tool error rather
// than an empty graph), and a manager call skips the error mapping that
// produces it.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import type { Client } from "@modelcontextprotocol/client";
import {
  call,
  connect,
  makeTempGraph,
  readFileText,
  textOf,
} from "./helpers.js";
import type { Connection } from "./helpers.js";

const alice = {
  name: "Alice",
  entityType: "person",
  observations: ["Works at Acme"],
};
const bob = { name: "Bob", entityType: "person", observations: [] };
const aliceLine =
  '{"type":"entity","name":"Alice","entityType":"person","observations":["Works at Acme"]}';
const bobLine =
  '{"type":"entity","name":"Bob","entityType":"person","observations":[]}';
const emptyGraph = { entities: [], relations: [] };

describe("the graph file destroyed from outside between operations (#5539)", () => {
  let dir: string;
  let filePath: string;
  let cleanup: () => Promise<void>;
  let conn: Connection;
  let client: Client;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  // Every case starts from a connected server that has saved Alice.
  beforeEach(async () => {
    ({ dir, filePath, cleanup } = await makeTempGraph());
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    conn = await connect(filePath);
    client = conn.client;
    await call(client, "create_entities", { entities: [alice] });
    expect(await readFileText(filePath)).toBe(`${aliceLine}\n`);
  });

  afterEach(async () => {
    await conn.close();
    await cleanup();
    vi.restoreAllMocks();
  });

  describe("deleted", () => {
    beforeEach(async () => {
      await fs.unlink(filePath);
    });

    it("reads as an empty graph, and a read does not recreate the file", async () => {
      const result = await call(client, "read_graph");

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual(emptyGraph);
      expect(await fs.readdir(dir)).toEqual([]);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("recreates the file on the next write, holding only what that write added", async () => {
      const created = await call(client, "create_entities", {
        entities: [bob],
      });

      expect(created.isError).toBeUndefined();
      expect(created.structuredContent).toEqual({ entities: [bob] });
      expect(await readFileText(filePath)).toBe(`${bobLine}\n`);
      expect(await fs.readdir(dir)).toEqual(["memory.jsonl"]);
      expect((await call(client, "read_graph")).structuredContent).toEqual({
        entities: [bob],
        relations: [],
      });
    });

    it("refuses a write that depends on a deleted entity, creating nothing", async () => {
      const result = await call(client, "add_observations", {
        observations: [{ entityName: "Alice", contents: ["Prefers email"] }],
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe("Entity with name Alice not found");
      expect(await fs.readdir(dir)).toEqual([]);
    });
  });

  describe("truncated to zero bytes", () => {
    beforeEach(async () => {
      await fs.writeFile(filePath, "");
    });

    it("reads as an empty graph, logging nothing and leaving the file as it is", async () => {
      const result = await call(client, "read_graph");

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual(emptyGraph);
      expect(await readFileText(filePath)).toBe("");
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("keeps working: the next write saves only what it added", async () => {
      const created = await call(client, "create_entities", {
        entities: [bob],
      });

      expect(created.isError).toBeUndefined();
      expect(created.structuredContent).toEqual({ entities: [bob] });
      expect(await readFileText(filePath)).toBe(`${bobLine}\n`);
      expect(await fs.readdir(dir)).toEqual(["memory.jsonl"]);
    });
  });

  // persistence.test.ts pins a directory that is at the path when the server
  // first looks. This is the file a running server already saved turning
  // into one: the calls must fail rather than report an empty graph, which a
  // later save would then write over whatever replaces the directory.
  describe("replaced by a directory", () => {
    beforeEach(async () => {
      await fs.unlink(filePath);
      await fs.mkdir(filePath);
    });

    it("fails reads and writes with EISDIR, leaving nothing behind", async () => {
      for (const [name, args] of [
        ["read_graph", {}],
        ["create_entities", { entities: [bob] }],
        ["delete_entities", { entityNames: ["Alice"] }],
      ] as const) {
        const result = await call(client, name, args);
        expect(result.isError).toBe(true);
        // Only the code is asserted: the text after it is Node's own, and
        // whether it ends with the path differs by platform (#5076, #5162).
        expect(textOf(result)).toMatch(/^EISDIR: /);
        expect(result.structuredContent).toBeUndefined();
      }

      // No lock file and no temp file beside the directory, nothing in it.
      expect(await fs.readdir(dir)).toEqual(["memory.jsonl"]);
      expect(await fs.readdir(filePath)).toEqual([]);
    });

    it("serves again once the directory is gone", async () => {
      expect((await call(client, "read_graph")).isError).toBe(true);
      await fs.rmdir(filePath);

      const created = await call(client, "create_entities", {
        entities: [bob],
      });

      expect(created.isError).toBeUndefined();
      expect(await readFileText(filePath)).toBe(`${bobLine}\n`);
    });
  });

  // A run killed between saveGraph's temp-file write and its rename leaves
  // `<name>.<32 hex>.tmp` beside the graph file. This one holds a complete
  // record and a cut-off one, so a load that read it would show either.
  describe("beside an orphaned temp file from a killed run", () => {
    const remnantName = "memory.jsonl.0123456789abcdef0123456789abcdef.tmp";
    const remnantText =
      '{"type":"entity","name":"Ghost","entityType":"person","observations":[]}\n' +
      '{"type":"entity","name":"Trunc';
    let remnantPath: string;

    beforeEach(async () => {
      remnantPath = path.join(dir, remnantName);
      await fs.writeFile(remnantPath, remnantText);
    });

    it("loads only the graph file", async () => {
      const result = await call(client, "read_graph");

      expect(result.structuredContent).toEqual({
        entities: [alice],
        relations: [],
      });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("saves past it, leaving the remnant untouched", async () => {
      const created = await call(client, "create_entities", {
        entities: [bob],
      });

      expect(created.isError).toBeUndefined();
      expect(await readFileText(filePath)).toBe(`${aliceLine}\n${bobLine}\n`);
      expect(await readFileText(remnantPath)).toBe(remnantText);
      expect((await fs.readdir(dir)).sort()).toEqual([
        "memory.jsonl",
        remnantName,
      ]);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
