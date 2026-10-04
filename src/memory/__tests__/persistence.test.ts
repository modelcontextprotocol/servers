// Characterization tests for how the memory server persists its graph, driven
// through an SDK Client over an in-memory transport (#4854): the JSONL file
// format, how unreadable lines are loaded and then rewritten, read and write
// failures as tool errors, the atomic temp-file save, and two servers sharing
// one file. Tests that pin a known bug cite its issue (#4885, #4827, #4797),
// so the PR that fixes it has a test to change.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
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
  observations: ["Works at Acme", "Prefers email"],
};
const bob = { name: "Bob", entityType: "person", observations: [] };
const carol = {
  name: "Carol",
  entityType: "person",
  observations: ["New hire"],
};
const aliceManagesBob = { from: "Alice", to: "Bob", relationType: "manages" };

describe("memory persistence over the protocol", () => {
  let dir: string;
  let filePath: string;
  let cleanup: () => Promise<void>;
  let conn: Connection | undefined;

  beforeEach(async () => {
    ({ dir, filePath, cleanup } = await makeTempGraph());
    conn = undefined;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await conn?.close();
    await cleanup();
  });

  async function open(): Promise<Connection> {
    conn = await connect(filePath);
    return conn;
  }

  describe("file format", () => {
    it("writes one JSON object per line, entities first, with a trailing newline", async () => {
      const { client } = await open();
      await call(client, "create_entities", { entities: [alice, bob] });
      await call(client, "create_relations", { relations: [aliceManagesBob] });

      expect(await readFileText(filePath)).toBe(
        [
          '{"type":"entity","name":"Alice","entityType":"person","observations":["Works at Acme","Prefers email"]}',
          '{"type":"entity","name":"Bob","entityType":"person","observations":[]}',
          '{"type":"relation","from":"Alice","to":"Bob","relationType":"manages"}',
          "",
        ].join("\n"),
      );
    });

    it("does not create the file until the first write", async () => {
      const { client } = await open();
      await call(client, "read_graph");
      await call(client, "search_nodes", { query: "x" });
      expect(await fs.readdir(dir)).toEqual([]);
    });

    it("leaves only the graph file behind after a write", async () => {
      const { client } = await open();
      await call(client, "create_entities", { entities: [alice] });
      expect(await fs.readdir(dir)).toEqual(["memory.jsonl"]);
    });

    it("serves a graph another server wrote to the same file", async () => {
      const writer = await connect(filePath);
      try {
        await call(writer.client, "create_entities", {
          entities: [alice, bob],
        });
        await call(writer.client, "create_relations", {
          relations: [aliceManagesBob],
        });
      } finally {
        await writer.close();
      }

      const { client } = await open();
      expect((await call(client, "read_graph")).structuredContent).toEqual({
        entities: [alice, bob],
        relations: [aliceManagesBob],
      });
    });

    it("drops unknown fields and the type tag when loading", async () => {
      await fs.writeFile(
        filePath,
        '{"type":"entity","name":"Alice","entityType":"person","observations":[],"extra":1}\n' +
          '{"type":"relation","from":"Alice","to":"Alice","relationType":"is","weight":2}\n',
      );
      const { client } = await open();
      expect((await call(client, "read_graph")).structuredContent).toEqual({
        entities: [{ name: "Alice", entityType: "person", observations: [] }],
        relations: [{ from: "Alice", to: "Alice", relationType: "is" }],
      });
    });
  });

  describe("unreadable lines", () => {
    // The #4885 file, plus one line for each remaining loadGraph branch.
    const seedLines = [
      '{"type":"entity","name":"Alice","entityType":"person","observations":["Works at Acme","Prefers email"]}',
      '{"type":"entity","name":"Bob","entityType":"person","observations":["Allergic to penicillin","Lives in Haifa",null]}',
      '{"type":"entity","name":"Project X","observations":["Deadline 2026-10-01","Budget 40k"]}',
      '{"type":"relation","from":"Alice","to":"Bob","relationType":"manages"}',
      '{"type":"relation","from":"Alice","to":"Bob"}',
      '{"type":"entity","name":"Trunc',
      '{"type":"entity","name":"A","entityType":"x","observations":[]}{"type":"entity","name":"B","entityType":"x","observations":[]}',
      "42",
      "null",
      '{"type":"note","text":"unknown type"}',
      "   ",
      "",
    ];

    async function seed() {
      await fs.writeFile(filePath, seedLines.join("\n") + "\n");
    }

    it("skips each unreadable line, logging why, and serves the rest", async () => {
      await seed();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { client } = await open();

      const result = await call(client, "read_graph");

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        entities: [alice],
        relations: [aliceManagesBob],
      });
      expect(errorSpy.mock.calls).toEqual([
        [
          "Skipping invalid entity in memory file:",
          "observations.2: Invalid input: expected string, received null",
        ],
        [
          "Skipping invalid entity in memory file:",
          "entityType: Invalid input: expected string, received undefined",
        ],
        [
          "Skipping invalid relation in memory file:",
          "relationType: Invalid input: expected string, received undefined",
        ],
        ["Skipping malformed line in memory file"],
        ["Skipping malformed line in memory file"],
        ["Skipping non-object line in memory file"],
        ["Skipping non-object line in memory file"],
      ]);
    });

    // KNOWN BUG #4885: pins current (wrong) behavior; the fix changes this assertion.
    // Characterizes #4885: the next write rewrites the file from the filtered
    // graph, so every unreadable line is deleted for good, and Bob loses two
    // valid observations because of one null. The relation to Bob now dangles.
    // The call reports success. The fix for #4885 changes this test.
    it("deletes the unreadable lines on the next unrelated write (#4885)", async () => {
      await seed();
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { client } = await open();

      const result = await call(client, "create_entities", {
        entities: [carol],
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({ entities: [carol] });
      expect(await readFileText(filePath)).toBe(
        [
          '{"type":"entity","name":"Alice","entityType":"person","observations":["Works at Acme","Prefers email"]}',
          '{"type":"entity","name":"Carol","entityType":"person","observations":["New hire"]}',
          '{"type":"relation","from":"Alice","to":"Bob","relationType":"manages"}',
          "",
        ].join("\n"),
      );
    });
  });

  describe("failures", () => {
    it("reports a graph file that cannot be read as a tool error", async () => {
      // A directory where the file should be: readFile fails with EISDIR,
      // which is not the ENOENT that means "no graph yet".
      await fs.mkdir(filePath);
      const { client } = await open();

      for (const [name, args] of [
        ["read_graph", {}],
        ["search_nodes", { query: "a" }],
        ["open_nodes", { names: ["a"] }],
        ["create_entities", { entities: [alice] }],
      ] as const) {
        const result = await call(client, name, args);
        expect(result.isError).toBe(true);
        expect(textOf(result)).toBe(
          "EISDIR: illegal operation on a directory, read",
        );
      }
      await expect(
        client.readResource({ uri: "memory://knowledge-graph" }),
      ).rejects.toThrow("EISDIR");
    });

    it("reports a failed save as a tool error and keeps the committed file", async () => {
      const { client } = await open();
      await call(client, "create_entities", { entities: [alice] });
      const before = await readFileText(filePath);

      vi.spyOn(fs, "rename").mockRejectedValueOnce(
        new Error("EXDEV: simulated rename failure"),
      );
      const result = await call(client, "create_entities", {
        entities: [bob],
      });

      expect(result).toEqual({
        content: [{ type: "text", text: "EXDEV: simulated rename failure" }],
        isError: true,
      });
      expect(await readFileText(filePath)).toBe(before);
      expect(await fs.readdir(dir)).toEqual(["memory.jsonl"]);
    });

    it("keeps serving after a failed save", async () => {
      const { client } = await open();
      vi.spyOn(fs, "writeFile").mockRejectedValueOnce(
        new Error("ENOSPC: simulated full disk"),
      );
      const failed = await call(client, "create_entities", {
        entities: [alice],
      });
      expect(failed.isError).toBe(true);

      const retried = await call(client, "create_entities", {
        entities: [alice],
      });
      expect(retried.structuredContent).toEqual({ entities: [alice] });
      expect(await fs.readdir(dir)).toEqual(["memory.jsonl"]);
    });
  });

  // #4827: saveGraph writes a new temp file and renames it over the graph
  // file, which replaces the file's inode. The save keeps the graph file's
  // own mode rather than a new file's, and refuses a read-only graph file as
  // a plain write would. POSIX only: Windows has no mode bits to lose.
  describe.skipIf(process.platform === "win32")("file mode (#4827)", () => {
    // The mode a file created now gets, which is what the temp file gets.
    async function newFileMode(): Promise<number> {
      const probe = path.join(dir, "mode-probe");
      await fs.writeFile(probe, "");
      const mode = (await fs.stat(probe)).mode & 0o777;
      await fs.rm(probe);
      return mode;
    }

    async function modeOf(file: string): Promise<number> {
      return (await fs.stat(file)).mode & 0o777;
    }

    it("keeps a hardened graph file's mode across a save", async () => {
      const { client } = await open();
      await call(client, "create_entities", { entities: [alice] });
      // 0600 as in the issue, unless the umask already makes new files 0600;
      // the original mode must differ from a new file's for a loss to show.
      const original = (await newFileMode()) === 0o600 ? 0o640 : 0o600;
      await fs.chmod(filePath, original);
      const writeFile = vi.spyOn(fs, "writeFile");

      await call(client, "create_entities", { entities: [bob] });

      // The temp file is created with that mode, never a wider one first.
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.tmp$/),
        expect.any(String),
        { mode: original },
      );
      expect(await modeOf(filePath)).toBe(original);
      expect((await call(client, "read_graph")).structuredContent).toEqual({
        entities: [alice, bob],
        relations: [],
      });
    });

    // root may write a read-only file, so the refusal shows only without it.
    it.skipIf(process.getuid?.() === 0)(
      "refuses to overwrite a read-only graph file",
      async () => {
        const { client } = await open();
        await call(client, "create_entities", { entities: [alice] });
        await fs.chmod(filePath, 0o444);
        const before = await readFileText(filePath);

        const result = await call(client, "create_entities", {
          entities: [bob],
        });

        expect(result.isError).toBe(true);
        expect(textOf(result)).toMatch(/EACCES/);
        expect(await modeOf(filePath)).toBe(0o444);
        expect(await readFileText(filePath)).toBe(before);
        expect(await fs.readdir(dir)).toEqual(["memory.jsonl"]);
      },
    );
  });

  // KNOWN BUG #4797: pins current (wrong) behavior; the fix changes this assertion.
  // Characterizes #4797: the mutation lock is per server instance, so two
  // servers on one file (two client processes in practice) can both load the
  // same graph, and the second save replaces the first. Both calls report
  // success. Each load is held until both servers have loaded, which is the
  // overlap the issue measured. The fix for #4797 changes this test.
  it("loses one of two concurrent writes from two servers on one file (#4797)", async () => {
    const seedEntity = { name: "Seed", entityType: "thing", observations: [] };
    await fs.writeFile(
      filePath,
      JSON.stringify({ type: "entity", ...seedEntity }) + "\n",
    );
    const first = await open();
    const second = await connect(filePath);

    try {
      const realReadFile = fs.readFile;
      let loads = 0;
      let releaseLoads: () => void = () => {};
      const bothLoaded = new Promise<void>((resolve) => {
        releaseLoads = resolve;
      });
      vi.spyOn(fs, "readFile").mockImplementation((async (
        ...args: Parameters<typeof fs.readFile>
      ) => {
        const data = await realReadFile(...args);
        loads += 1;
        if (loads === 2) {
          releaseLoads();
        }
        await bothLoaded;
        return data;
      }) as typeof fs.readFile);

      const a = { name: "From A", entityType: "thing", observations: [] };
      const b = { name: "From B", entityType: "thing", observations: [] };
      const [resultA, resultB] = await Promise.all([
        call(first.client, "create_entities", { entities: [a] }),
        call(second.client, "create_entities", { entities: [b] }),
      ]);
      vi.restoreAllMocks();

      expect(resultA.structuredContent).toEqual({ entities: [a] });
      expect(resultB.structuredContent).toEqual({ entities: [b] });
      const graph = (await call(first.client, "read_graph"))
        .structuredContent as { entities: { name: string }[] };
      const names = graph.entities.map((e) => e.name);
      expect(names).toHaveLength(2);
      expect(names[0]).toBe("Seed");
      expect(["From A", "From B"]).toContain(names[1]);
    } finally {
      await second.close();
    }
  });
});
