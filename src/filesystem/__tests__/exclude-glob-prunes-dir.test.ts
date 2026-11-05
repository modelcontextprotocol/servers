// An excludePatterns glob ending in "/**" prunes the directory it names (#5445).
// minimatch matches "**/node_modules/**" only against paths below a
// node_modules, never the directory entry itself, so search_files and
// directory_tree used to realpath and readdir an excluded node_modules (breaking
// the #4162 promise that an excluded slow folder is never touched) and could
// still return it: search_files listed the directory, directory_tree showed it
// empty. isExcludedPath now also matches such a pattern with the "/**" removed,
// for directory entries only, so a file of the same name is kept.
// These tests drive both tools through a real client and assert the directory
// is neither touched nor returned, then pin the predicate's rule directly.

import fs from "fs/promises";
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
import { isExcludedPath } from "../lib.js";

interface TreeEntry {
  name: string;
  type: "file" | "directory";
  children?: TreeEntry[];
}

let dir: string;
let conn: Connected;
let client: Client;

// dir/
//   index.js
//   node_modules/dep.js
//   node_modules_old/keep.js
//   packages/app/main.js
//   packages/app/node_modules/nested.js
beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-exclude-glob-");
  const files = [
    "index.js",
    "node_modules/dep.js",
    "node_modules_old/keep.js",
    "packages/app/main.js",
    "packages/app/node_modules/nested.js",
  ];
  for (const file of files) {
    await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await fs.writeFile(path.join(dir, file), "");
  }
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

const p = (posix: string) => path.join(...posix.split("/"));

/** The search_files result as paths relative to `dir`, sorted. */
async function search(
  pattern: string,
  excludePatterns: string[],
): Promise<string[]> {
  const result = await call(client, "search_files", {
    path: dir,
    pattern,
    excludePatterns,
  });
  expect(result.isError).toBeFalsy();
  return textOf(result)
    .split("\n")
    .map((line) => path.relative(dir, line))
    .sort();
}

/** Every entry (files and directories) in a directory_tree result, relative to `dir`, sorted. */
async function treeEntries(excludePatterns: string[]): Promise<string[]> {
  const result = await call(client, "directory_tree", {
    path: dir,
    excludePatterns,
  });
  expect(result.isError).toBeFalsy();
  const entries: string[] = [];
  const walk = (list: TreeEntry[], prefix: string) => {
    for (const entry of list) {
      const relative = path.join(prefix, entry.name);
      entries.push(relative);
      walk(entry.children ?? [], relative);
    }
  };
  walk(JSON.parse(textOf(result)) as TreeEntry[], "");
  return entries.sort();
}

/** Run `action` and return every realpath/readdir target under a node_modules directory. */
async function nodeModulesTouched(action: () => Promise<unknown>) {
  const realpath = vi.spyOn(fs, "realpath");
  const readdir = vi.spyOn(fs, "readdir");
  await action();
  const excluded = [
    path.join(dir, "node_modules"),
    path.join(dir, "packages", "app", "node_modules"),
  ];
  return [...realpath.mock.calls, ...readdir.mock.calls]
    .map(([target]) => target.toString())
    .filter((target) =>
      excluded.some(
        (root) => target === root || target.startsWith(root + path.sep),
      ),
    );
}

const kept = [
  "index.js",
  "node_modules_old",
  "node_modules_old/keep.js",
  "packages",
  "packages/app",
  "packages/app/main.js",
].map(p);

describe('excludePatterns ending in "/**" (#5445)', () => {
  it("search_files does not return the excluded directory or anything below it", async () => {
    expect(await search("**/*", ["**/node_modules/**"])).toEqual(kept);
  });

  it("search_files does not return the directory when the pattern names it", async () => {
    const result = await call(client, "search_files", {
      path: dir,
      pattern: "**/node_modules",
      excludePatterns: ["**/node_modules/**"],
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe("No matches found");
  });

  it("directory_tree does not list the excluded directory, even as empty", async () => {
    expect(await treeEntries(["**/node_modules/**"])).toEqual(kept);
  });

  it("search_files never realpaths or reads the excluded directory (#4162)", async () => {
    expect(
      await nodeModulesTouched(() => search("**/*", ["**/node_modules/**"])),
    ).toEqual([]);
  });

  it("directory_tree never realpaths or reads the excluded directory (#4162)", async () => {
    expect(
      await nodeModulesTouched(() => treeEntries(["**/node_modules/**"])),
    ).toEqual([]);
  });

  it("prunes only the directory a rooted pattern names", async () => {
    // "node_modules/**" names the root's node_modules only; the nested one stays.
    expect(await search("**/*.js", ["node_modules/**"])).toEqual(
      [
        "index.js",
        "node_modules_old/keep.js",
        "packages/app/main.js",
        "packages/app/node_modules/nested.js",
      ].map(p),
    );
  });

  it("keeps a file the suffix-less pattern would match, in both tools", async () => {
    // "*/**" names every top-level directory; index.js is a file, so it stays.
    expect(await search("**/*", ["*/**"])).toEqual(["index.js"]);
    expect(await treeEntries(["*/**"])).toEqual(["index.js"]);
  });
});

describe('isExcludedPath with a "/**" pattern', () => {
  const dirPattern = ["**/node_modules/**"];

  it("matches the named directory as well as the paths below it", () => {
    expect(isExcludedPath("node_modules", dirPattern, true)).toBe(true);
    expect(
      isExcludedPath(p("packages/app/node_modules"), dirPattern, true),
    ).toBe(true);
    expect(isExcludedPath(p("node_modules/dep.js"), dirPattern)).toBe(true);
  });

  it("does not exclude a file the suffix-less pattern would match", () => {
    expect(isExcludedPath("node_modules", dirPattern)).toBe(false);
    expect(isExcludedPath("node_modules", dirPattern, false)).toBe(false);
    expect(isExcludedPath("index.js", ["*/**"], false)).toBe(false);
  });

  it("keeps whole-name matching and the rest of wildcard semantics", () => {
    expect(isExcludedPath("node_modules_old", dirPattern, true)).toBe(false);
    expect(isExcludedPath(p("a/node_modules"), ["node_modules/**"], true)).toBe(
      false,
    );
    // Only a trailing "/**" is stripped: "**" alone still matches everything,
    // and a pattern without the suffix is matched as written.
    expect(isExcludedPath("anything", ["**"])).toBe(true);
    expect(isExcludedPath("node_modules", ["**/node_modules/*"], true)).toBe(
      false,
    );
  });
});
