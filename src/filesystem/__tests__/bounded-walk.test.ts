// Protocol-level tests for the bounds on slow filesystem calls and on the
// recursive walks (#4162). A macOS CloudStorage or iCloud Drive folder can make
// realpath or readdir block for minutes, which no CI runner can reproduce, so
// these tests stand a call that never settles in for the slow provider: they
// spy on the fs/promises object the server shares with this file, and advance
// fake timers past FS_CALL_TIMEOUT_MS instead of waiting it out. Every call
// they do not single out goes to the real filesystem.

import fs from "fs/promises";
import type { Dirent, PathLike } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/client";
import {
  call,
  connect,
  makeTempDir,
  quietStderr,
  textOf,
  type Connected,
} from "./helpers.js";
import { FS_CALL_TIMEOUT_MS, MAX_WALK_ENTRIES } from "../lib.js";

const realReaddir = fs.readdir.bind(fs);
const realRealpath = fs.realpath.bind(fs);

// The cap tests walk MAX_WALK_ENTRIES + 1 entries on purpose, so their cost is
// the bound they check and scales with the runner: about 1 s locally, near
// vitest's 5 s default on a loaded Windows runner (#5328). An explicit timeout
// keeps them from failing on load; a retry would hide a real failure, and a
// smaller cap would stop them testing the real bound.
const WALK_CAP = { timeout: 30_000 };

let dir: string;
let conn: Connected;
let client: Client;

beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-bounded-");
  await fs.mkdir(path.join(dir, "cloud", "deep"), { recursive: true });
  await fs.mkdir(path.join(dir, "local"));
  await fs.writeFile(path.join(dir, "local", "a.txt"), "");
  await fs.writeFile(path.join(dir, "cloud", "deep", "b.txt"), "");
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

/**
 * Make fs.readdir or fs.realpath never settle for `stalled`, the way a lazy
 * provider path blocks. Resolves once the server has made that call, so the
 * test advances the clock only after the timeout is armed.
 */
function stall(method: "readdir" | "realpath", stalled: string): Promise<void> {
  let reached!: () => void;
  const called = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const real = method === "readdir" ? realReaddir : realRealpath;
  const fake = (target: PathLike, ...rest: unknown[]): Promise<unknown> => {
    if (target.toString() === stalled) {
      reached();
      return new Promise(() => {});
    }
    return (real as (target: PathLike, ...rest: unknown[]) => Promise<unknown>)(
      target,
      ...rest,
    );
  };
  if (method === "readdir") {
    vi.spyOn(fs, "readdir").mockImplementation(fake as typeof fs.readdir);
  } else {
    vi.spyOn(fs, "realpath").mockImplementation(fake as typeof fs.realpath);
  }
  return called;
}

/** Start a tool call against a stalled path, and run the clock past the timeout. */
async function callPastTimeout(
  called: Promise<void>,
  name: string,
  args: Record<string, unknown>,
) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const pending = call(client, name, args);
  await called;
  await vi.advanceTimersByTimeAsync(FS_CALL_TIMEOUT_MS);
  return pending;
}

/** `count` plain-file directory entries named f0, f1, … under `parent`. */
function fileEntries(parent: string, count: number): Dirent[] {
  return Array.from(
    { length: count },
    (_, index) =>
      ({
        name: `f${index}`,
        parentPath: parent,
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
      }) as Dirent,
  );
}

describe("search_files", () => {
  it("applies excludePatterns before touching an entry: an excluded subtree is never realpath'd or read", async () => {
    const realpath = vi.spyOn(fs, "realpath");
    const readdir = vi.spyOn(fs, "readdir");
    const result = await call(client, "search_files", {
      path: dir,
      pattern: "**/*.txt",
      excludePatterns: ["cloud"],
    });
    expect(textOf(result)).toBe(path.join(dir, "local", "a.txt"));
    const cloud = path.join(dir, "cloud");
    const touched = [...realpath.mock.calls, ...readdir.mock.calls].map(
      ([target]) => target.toString(),
    );
    expect(touched.filter((target) => target.startsWith(cloud))).toEqual([]);
  });

  it("fails with a timeout error when a subdirectory's readdir never settles", async () => {
    const called = stall("readdir", path.join(dir, "cloud"));
    const result = await callPastTimeout(called, "search_files", {
      path: dir,
      pattern: "**/*.txt",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(
      `Filesystem call timed out after ${FS_CALL_TIMEOUT_MS} ms: readdir ${path.join(dir, "cloud")}`,
    );
  });

  it("fails closed when an entry's realpath never settles: the entry is not admitted and the search errors", async () => {
    const stalled = path.join(dir, "cloud", "deep", "b.txt");
    const called = stall("realpath", stalled);
    const result = await callPastTimeout(called, "search_files", {
      path: dir,
      pattern: "**/*.txt",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(`realpath ${stalled}`);
  });

  it(
    `stops with an error after visiting ${MAX_WALK_ENTRIES} entries`,
    WALK_CAP,
    async () => {
      vi.spyOn(fs, "readdir").mockImplementation(((target: PathLike) =>
        target.toString() === dir
          ? Promise.resolve(fileEntries(dir, MAX_WALK_ENTRIES + 1))
          : realReaddir(target)) as typeof fs.readdir);
      // The listed names do not exist on disk; resolve them as themselves so
      // each entry costs a string check rather than a real lookup.
      vi.spyOn(fs, "realpath").mockImplementation(((target: PathLike) =>
        Promise.resolve(target.toString())) as typeof fs.realpath);
      const result = await call(client, "search_files", {
        path: dir,
        pattern: "nothing-matches",
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(
        `search_files stopped after visiting ${MAX_WALK_ENTRIES} entries under ${dir}`,
      );
    },
  );

  it("still skips an entry that fails for any other reason", async () => {
    const refused = path.join(dir, "local", "a.txt");
    vi.spyOn(fs, "realpath").mockImplementation(((target: PathLike) =>
      target.toString() === refused
        ? Promise.reject(Object.assign(new Error("EACCES"), { code: "EACCES" }))
        : realRealpath(target)) as typeof fs.realpath);
    const result = await call(client, "search_files", {
      path: dir,
      pattern: "**/*.txt",
    });
    expect(textOf(result)).toBe(path.join(dir, "cloud", "deep", "b.txt"));
  });
});

describe("directory_tree", () => {
  it("fails with a timeout error when a subdirectory's readdir never settles", async () => {
    const called = stall("readdir", path.join(dir, "cloud", "deep"));
    const result = await callPastTimeout(called, "directory_tree", {
      path: dir,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(
      `readdir ${path.join(dir, "cloud", "deep")}`,
    );
  });

  it(
    `stops with an error after visiting ${MAX_WALK_ENTRIES} entries`,
    WALK_CAP,
    async () => {
      vi.spyOn(fs, "readdir").mockImplementation(((target: PathLike) =>
        target.toString() === dir
          ? Promise.resolve(fileEntries(dir, MAX_WALK_ENTRIES + 1))
          : realReaddir(target)) as typeof fs.readdir);
      const result = await call(client, "directory_tree", { path: dir });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(
        `directory_tree stopped after visiting ${MAX_WALK_ENTRIES} entries under ${dir}`,
      );
    },
  );

  it("does not count excluded entries toward the cap", WALK_CAP, async () => {
    vi.spyOn(fs, "readdir").mockImplementation(((target: PathLike) =>
      target.toString() === dir
        ? Promise.resolve(fileEntries(dir, MAX_WALK_ENTRIES + 1))
        : realReaddir(target)) as typeof fs.readdir);
    const result = await call(client, "directory_tree", {
      path: dir,
      excludePatterns: ["f*"],
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result))).toEqual([]);
  });
});

describe("path validation", () => {
  it("refuses a path whose realpath never settles, rather than admitting it", async () => {
    const stalled = path.join(dir, "local", "a.txt");
    const called = stall("realpath", stalled);
    const result = await callPastTimeout(called, "read_text_file", {
      path: stalled,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(
      `Filesystem call timed out after ${FS_CALL_TIMEOUT_MS} ms: realpath ${stalled}`,
    );
  });
});

describe("allowed-directory case respelling (#470)", () => {
  it("refuses the respelling when the parent's readdir never settles", async () => {
    const root = path.join(dir, "CaseTest");
    await fs.mkdir(root);
    await fs.writeFile(path.join(root, "f.txt"), "inside");
    const scoped = await connect([root]);
    try {
      client = scoped.client;
      const called = stall("readdir", dir);
      const result = await callPastTimeout(called, "read_text_file", {
        path: path.join(dir, "CASETEST", "f.txt"),
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/^Access denied - path outside/);
    } finally {
      vi.useRealTimers();
      await scoped.close();
    }
  });
});
