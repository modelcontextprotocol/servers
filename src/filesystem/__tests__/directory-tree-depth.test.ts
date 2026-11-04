// Protocol-level tests for directory_tree's optional `depth` (#1077), driven
// through a real Client over an in-memory transport. Omitted, the tree is the
// whole tree, as before; set, the walk stops at that level, directories there
// are listed without a children array, and nothing below them is read, so a
// shallow view of a huge tree costs neither the readdirs nor the entry budget
// of the bounded walk (#4162).

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

interface TreeEntry {
  name: string;
  type: "file" | "directory";
  children?: TreeEntry[];
}

/** Sort a tree by name at every level; readdir order is the OS's. */
function sortTree(entries: TreeEntry[]): TreeEntry[] {
  return [...entries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) =>
      entry.children ? { ...entry, children: sortTree(entry.children) } : entry,
    );
}

let dir: string;
let conn: Connected;
let client: Client;

// dir/
//   top.txt
//   empty/
//   a/
//     a.txt
//     b/
//       b.txt
//       c/
//         c.txt
beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-tree-depth-");
  await fs.mkdir(path.join(dir, "a", "b", "c"), { recursive: true });
  await fs.mkdir(path.join(dir, "empty"));
  await fs.writeFile(path.join(dir, "top.txt"), "");
  await fs.writeFile(path.join(dir, "a", "a.txt"), "");
  await fs.writeFile(path.join(dir, "a", "b", "b.txt"), "");
  await fs.writeFile(path.join(dir, "a", "b", "c", "c.txt"), "");
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

async function tree(args: Record<string, unknown>): Promise<TreeEntry[]> {
  const result = await call(client, "directory_tree", { path: dir, ...args });
  expect(result.isError, textOf(result)).toBeFalsy();
  return sortTree(JSON.parse(textOf(result)) as TreeEntry[]);
}

const FULL: TreeEntry[] = [
  {
    name: "a",
    type: "directory",
    children: [
      { name: "a.txt", type: "file" },
      {
        name: "b",
        type: "directory",
        children: [
          { name: "b.txt", type: "file" },
          {
            name: "c",
            type: "directory",
            children: [{ name: "c.txt", type: "file" }],
          },
        ],
      },
    ],
  },
  { name: "empty", type: "directory", children: [] },
  { name: "top.txt", type: "file" },
];

describe("directory_tree depth", () => {
  it("returns the whole tree when depth is omitted", async () => {
    expect(await tree({})).toEqual(FULL);
  });

  it("lists only the entries directly in path at depth 1, directories without children", async () => {
    expect(await tree({ depth: 1 })).toEqual([
      { name: "a", type: "directory" },
      { name: "empty", type: "directory" },
      { name: "top.txt", type: "file" },
    ]);
  });

  it("descends one more level at depth 2", async () => {
    expect(await tree({ depth: 2 })).toEqual([
      {
        name: "a",
        type: "directory",
        children: [
          { name: "a.txt", type: "file" },
          { name: "b", type: "directory" },
        ],
      },
      { name: "empty", type: "directory", children: [] },
      { name: "top.txt", type: "file" },
    ]);
  });

  it("returns the whole tree when depth reaches past its bottom", async () => {
    expect(await tree({ depth: 4 })).toEqual(FULL);
    expect(await tree({ depth: 100 })).toEqual(FULL);
  });

  it("applies excludePatterns within the depth", async () => {
    expect(await tree({ depth: 2, excludePatterns: ["a.txt"] })).toEqual([
      {
        name: "a",
        type: "directory",
        children: [{ name: "b", type: "directory" }],
      },
      { name: "empty", type: "directory", children: [] },
      { name: "top.txt", type: "file" },
    ]);
  });

  it("never reads a directory below the depth", async () => {
    const readdir = vi.spyOn(fs, "readdir");
    await tree({ depth: 2 });
    const read = readdir.mock.calls.map(([target]) => String(target));
    expect(read).toContain(path.join(dir, "a"));
    expect(read).not.toContain(path.join(dir, "a", "b"));
    expect(read).not.toContain(path.join(dir, "a", "b", "c"));
  });

  it.each([0, -1, 1.5, "2"])("rejects depth %j", async (depth) => {
    const result = await call(client, "directory_tree", { path: dir, depth });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(
      /^Input validation error: Invalid arguments for tool directory_tree/,
    );
  });

  it("advertises depth as an optional positive integer", async () => {
    const { tools } = await client.listTools();
    const schema = tools.find((t) => t.name === "directory_tree")
      ?.inputSchema as {
      properties: Record<string, Record<string, unknown>>;
      required?: string[];
    };
    expect(schema.properties.depth).toMatchObject({
      type: "integer",
      exclusiveMinimum: 0,
    });
    expect(schema.properties.depth.description).toMatch(/^How many levels/);
    expect(schema.required).toEqual(["path"]);
  });
});
