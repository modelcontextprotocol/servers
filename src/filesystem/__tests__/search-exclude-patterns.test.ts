// search_files and directory_tree read `excludePatterns` the same way (#5216).
// directory_tree matched a bare name such as "node_modules" at any depth and
// pruned the subtree below it, while search_files matched every pattern only
// against the path relative to the searched root, so the same argument left a
// nested node_modules in one tool's result and not the other's. Both now go
// through isExcludedPath. These tests drive both tools over one tree through a
// real client, check that a nested excluded directory is still never realpath'd
// or read (#4162), and pin the predicate's rules directly: whole-name matching,
// and wildcard patterns matched as written.

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
//   packages/app/debug.log
//   debug.log
beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-exclude-");
  const files = [
    "index.js",
    "debug.log",
    "node_modules/dep.js",
    "node_modules_old/keep.js",
    "packages/app/main.js",
    "packages/app/debug.log",
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

/** Every file path in a directory_tree result, relative to `dir`, sorted. */
async function treeFiles(excludePatterns: string[]): Promise<string[]> {
  const result = await call(client, "directory_tree", {
    path: dir,
    excludePatterns,
  });
  expect(result.isError).toBeFalsy();
  const files: string[] = [];
  const walk = (entries: TreeEntry[], prefix: string) => {
    for (const entry of entries) {
      const relative = path.join(prefix, entry.name);
      if (entry.type === "file") files.push(relative);
      walk(entry.children ?? [], relative);
    }
  };
  walk(JSON.parse(textOf(result)) as TreeEntry[], "");
  return files.sort();
}

describe("search_files excludePatterns (#5216)", () => {
  it("excludes a bare name at any depth, not only at the searched root", async () => {
    expect(await search("**/*.js", ["node_modules"])).toEqual(
      ["index.js", "node_modules_old/keep.js", "packages/app/main.js"].map(
        (p) => path.join(...p.split("/")),
      ),
    );
  });

  it("returns the same files directory_tree lists for the same excludePatterns", async () => {
    for (const excludePatterns of [
      ["node_modules"],
      ["app"],
      ["*.log"],
      ["**/*.log", "node_modules"],
    ]) {
      expect(await search("**/*.*", excludePatterns)).toEqual(
        await treeFiles(excludePatterns),
      );
    }
  });

  it("never realpaths or reads a nested excluded directory (#4162)", async () => {
    const realpath = vi.spyOn(fs, "realpath");
    const readdir = vi.spyOn(fs, "readdir");
    await search("**/*.js", ["node_modules"]);
    const nested = path.join(dir, "packages", "app", "node_modules");
    const touched = [...realpath.mock.calls, ...readdir.mock.calls].map(
      ([target]) => target.toString(),
    );
    expect(touched.filter((target) => target.startsWith(nested))).toEqual([]);
  });

  it("keeps matching a wildcard pattern against the relative path as written", async () => {
    // "*.log" has a wildcard, so it is not expanded to any depth: it excludes
    // the root's debug.log only, in both tools.
    const expected = ["packages/app/debug.log"].map((p) =>
      path.join(...p.split("/")),
    );
    expect(await search("**/*.log", ["*.log"])).toEqual(expected);
    expect(
      (await treeFiles(["*.log"])).filter((file) => file.endsWith(".log")),
    ).toEqual(expected);
  });
});

describe("isExcludedPath", () => {
  const p = (posix: string) => path.join(...posix.split("/"));

  it("matches a bare name at the root, at any depth, and below it", () => {
    expect(isExcludedPath("node_modules", ["node_modules"])).toBe(true);
    expect(isExcludedPath(p("a/b/node_modules"), ["node_modules"])).toBe(true);
    expect(isExcludedPath(p("a/node_modules/x/y.js"), ["node_modules"])).toBe(
      true,
    );
  });

  it("matches whole names, never a prefix", () => {
    expect(isExcludedPath("node_modules_old", ["node_modules"])).toBe(false);
    expect(isExcludedPath(p("a/node_modules_old/x.js"), ["node_modules"])).toBe(
      false,
    );
  });

  it("matches a wildcard pattern only as written", () => {
    expect(isExcludedPath("debug.log", ["*.log"])).toBe(true);
    expect(isExcludedPath(p("a/debug.log"), ["*.log"])).toBe(false);
    expect(isExcludedPath(p("a/debug.log"), ["**/*.log"])).toBe(true);
  });

  it("excludes nothing for an empty list", () => {
    expect(isExcludedPath("anything", [])).toBe(false);
  });
});
