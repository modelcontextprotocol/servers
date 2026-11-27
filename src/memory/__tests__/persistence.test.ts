// Characterization tests for how the memory server persists its graph, driven
// through an SDK Client over an in-memory transport (#4854): the JSONL file
// format, how unreadable lines are loaded and then kept on write, read and write
// failures as tool errors, the atomic temp-file save, and two servers sharing
// one file.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
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

    // #4885: the next write keeps the unreadable lines out of the graph but
    // writes them back verbatim, after the graph's own lines, so Bob keeps his
    // valid observations and the relation to him still has its entity on
    // disk. Blank lines carry no data and are not kept.
    it("keeps the unreadable lines on the next unrelated write (#4885)", async () => {
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
          '{"type":"entity","name":"Bob","entityType":"person","observations":["Allergic to penicillin","Lives in Haifa",null]}',
          '{"type":"entity","name":"Project X","observations":["Deadline 2026-10-01","Budget 40k"]}',
          '{"type":"relation","from":"Alice","to":"Bob"}',
          '{"type":"entity","name":"Trunc',
          '{"type":"entity","name":"A","entityType":"x","observations":[]}{"type":"entity","name":"B","entityType":"x","observations":[]}',
          "42",
          "null",
          '{"type":"note","text":"unknown type"}',
          "",
        ].join("\n"),
      );
      // The kept lines stay out of the graph.
      expect((await call(client, "read_graph")).structuredContent).toEqual({
        entities: [alice, carol],
        relations: [aliceManagesBob],
      });
    });
  });

  describe("failures", () => {
    it("reports a graph file that cannot be read as a tool error", async () => {
      // A directory where the file should be: readFile fails with EISDIR,
      // which is not the ENOENT that means "no graph yet".
      await fs.mkdir(filePath);
      const { client } = await open();
      // Whether Node appends the path to the message depends on the platform,
      // not the Node version: Node 26 on Linux appends it, while every Node
      // on macOS gives the bare text (#5076, #5162). The server passes Node's
      // message through unchanged, so accept exactly either form.
      const bare = "EISDIR: illegal operation on a directory, read";
      const expected = [bare, `${bare} '${filePath}'`];

      for (const [name, args] of [
        ["read_graph", {}],
        ["search_nodes", { query: "a" }],
        ["open_nodes", { names: ["a"] }],
        ["create_entities", { entities: [alice] }],
      ] as const) {
        const result = await call(client, name, args);
        expect(result.isError).toBe(true);
        expect(expected).toContain(textOf(result));
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
      const realOpen = fs.open;
      let refused = false;
      vi.spyOn(fs, "open").mockImplementation((async (
        ...args: Parameters<typeof fs.open>
      ) => {
        const handle = await realOpen(...args);
        if (!refused && String(args[0]).endsWith(".tmp")) {
          refused = true;
          handle.writeFile = async () => {
            throw new Error("ENOSPC: simulated full disk");
          };
        }
        return handle;
      }) as typeof fs.open);
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
      const openSpy = vi.spyOn(fs, "open");

      await call(client, "create_entities", { entities: [bob] });

      // The temp file is created with that mode, never a wider one first.
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\.tmp$/),
        "wx",
        original,
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

  // The temp file's name is in a directory others may write, so anything can
  // appear at it while a save runs. The save creates it exclusively and then
  // works only through its own handle: whatever stands at the name (a symlink
  // to another file, say) is never written, chmodded or renamed onto the
  // graph path. POSIX only: creating a symlink on Windows needs privileges.
  describe.skipIf(process.platform === "win32")("the temp file's name", () => {
    let outsideDir: string;
    let outside: string;
    const outsideText = "not part of the graph\n";

    beforeEach(async () => {
      outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "memory-outside-"));
      outside = path.join(outsideDir, "outside.txt");
      await fs.writeFile(outside, outsideText);
      await fs.chmod(outside, 0o600);
    });

    afterEach(async () => {
      await fs.rm(outsideDir, { recursive: true, force: true });
    });

    function isTempPath(target: unknown): target is string {
      return (
        typeof target === "string" &&
        path.dirname(target) === dir &&
        target.endsWith(".tmp")
      );
    }

    // Runs hook on the temp path when the save creates its temp file,
    // before the creating call (when: "before") or after it (when: "after").
    function onTempCreate(
      when: "before" | "after",
      hook: (tempPath: string) => Promise<void>,
    ): void {
      const realOpen = fs.open;
      const realWriteFile = fs.writeFile;
      vi.spyOn(fs, "open").mockImplementation((async (
        ...args: Parameters<typeof fs.open>
      ) => {
        if (!isTempPath(args[0])) return realOpen(...args);
        if (when === "before") await hook(args[0]);
        const handle = await realOpen(...args);
        if (when === "after") await hook(args[0]);
        return handle;
      }) as typeof fs.open);
      vi.spyOn(fs, "writeFile").mockImplementation((async (
        ...args: Parameters<typeof fs.writeFile>
      ) => {
        if (!isTempPath(args[0])) return realWriteFile(...args);
        if (when === "before") await hook(args[0]);
        await realWriteFile(...args);
        if (when === "after") await hook(args[0]);
      }) as typeof fs.writeFile);
    }

    async function seed(): Promise<{
      client: Connection["client"];
      before: string;
    }> {
      const { client } = await open();
      await call(client, "create_entities", { entities: [alice] });
      await fs.chmod(filePath, 0o644);
      return { client, before: await readFileText(filePath) };
    }

    async function expectOnlyTheGraphUntouched(before: string): Promise<void> {
      expect((await fs.stat(outside)).mode & 0o777).toBe(0o600);
      expect(await readFileText(outside)).toBe(outsideText);
      expect((await fs.lstat(filePath)).isFile()).toBe(true);
      expect(await readFileText(filePath)).toBe(before);
      expect(await fs.readdir(dir)).toEqual(["memory.jsonl"]);
    }

    it("never writes through a link already at the temp name", async () => {
      const { client, before } = await seed();
      onTempCreate("before", (tempPath) => fs.symlink(outside, tempPath));

      const result = await call(client, "create_entities", {
        entities: [bob],
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/EEXIST/);
      await expectOnlyTheGraphUntouched(before);
    });

    it("refuses the save when the temp name is replaced after it is created", async () => {
      const { client, before } = await seed();
      onTempCreate("after", async (tempPath) => {
        await fs.unlink(tempPath);
        await fs.symlink(outside, tempPath);
      });

      const result = await call(client, "create_entities", {
        entities: [bob],
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/was replaced/);
      await expectOnlyTheGraphUntouched(before);
    });

    it("saves normally when nothing else touches the temp name", async () => {
      const { client } = await seed();
      onTempCreate("after", async () => {});

      await call(client, "create_entities", { entities: [bob] });

      expect((await fs.stat(outside)).mode & 0o777).toBe(0o600);
      expect((await fs.lstat(filePath)).isFile()).toBe(true);
      expect((await fs.stat(filePath)).mode & 0o777).toBe(0o644);
      expect((await call(client, "read_graph")).structuredContent).toEqual({
        entities: [alice, bob],
        relations: [],
      });
    });
  });

  // #4797: two servers on one file (two client processes in practice) used to
  // both load the same graph, and the second save replaced the first, with
  // both calls reporting success. Each graph load here is held long enough for
  // the other server's mutation to start, which is the overlap the issue
  // measured. The lock file around each mutation makes the second one wait
  // and load the graph the first one saved, so both writes survive.
  it("keeps both of two concurrent writes from two servers on one file (#4797)", async () => {
    const seedEntity = { name: "Seed", entityType: "thing", observations: [] };
    await fs.writeFile(
      filePath,
      JSON.stringify({ type: "entity", ...seedEntity }) + "\n",
    );
    const first = await open();
    const second = await connect(filePath);

    try {
      const realReadFile = fs.readFile;
      vi.spyOn(fs, "readFile").mockImplementation((async (
        ...args: Parameters<typeof fs.readFile>
      ) => {
        const data = await realReadFile(...args);
        if (args[0] === filePath) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
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
      expect(names[0]).toBe("Seed");
      expect(names.slice(1).sort()).toEqual(["From A", "From B"]);
      expect(await fs.readdir(dir)).toEqual(["memory.jsonl"]);
    } finally {
      await second.close();
    }
  });
});
