// Every property of every tool input schema the server advertises in
// tools/list carries a description (#3669). A model reads these to decide what
// to pass, and with no description it guesses from the property name alone.
// This is the reference implementation other server authors copy, so the rule
// is pinned for every tool, existing or added later, and for nested
// properties (array items, object fields) as well as top-level ones. The
// excludePatterns descriptions state matching rules that differ between
// directory_tree and search_files, so those rules are pinned here as well.

import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  call,
  connect,
  makeTempDir,
  quietStderr,
  textOf,
  type Connected,
} from "./helpers.js";

/** A JSON Schema node, as much of it as the walk reads. */
type SchemaNode = {
  description?: unknown;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode | SchemaNode[];
  anyOf?: SchemaNode[];
  oneOf?: SchemaNode[];
  allOf?: SchemaNode[];
};

/**
 * The path of every property under `node`, at any depth, that has no
 * non-empty description: the properties of nested objects and of array
 * items count, since a model fills those in too.
 */
function undescribed(node: SchemaNode, path: string): string[] {
  const missing: string[] = [];
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    const at = `${path}.${key}`;
    if (
      typeof child.description !== "string" ||
      child.description.trim() === ""
    ) {
      missing.push(at);
    }
    missing.push(...undescribed(child, at));
  }
  const items = node.items;
  for (const item of Array.isArray(items) ? items : items ? [items] : []) {
    missing.push(...undescribed(item, `${path}[]`));
  }
  for (const branch of [
    ...(node.anyOf ?? []),
    ...(node.oneOf ?? []),
    ...(node.allOf ?? []),
  ]) {
    missing.push(...undescribed(branch, path));
  }
  return missing;
}

let dir: string;
let conn: Connected;

beforeEach(async () => {
  // The server logs its roots decision to stderr on every connect.
  quietStderr();
  dir = await makeTempDir("mcp-fs-descriptions-");
  conn = await connect([dir]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("tool input descriptions (#3669)", () => {
  it("describes every input property of every tool", async () => {
    const { tools } = await conn.client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    const missing = tools.flatMap((tool) =>
      undescribed(tool.inputSchema as SchemaNode, tool.name),
    );
    expect(missing).toEqual([]);
  });
});

describe("excludePatterns, as the descriptions state it (#3669)", () => {
  beforeEach(async () => {
    // A node_modules at the top level and one nested a level down.
    await fs.mkdir(path.join(dir, "node_modules"));
    await fs.writeFile(path.join(dir, "node_modules", "top.txt"), "");
    await fs.mkdir(path.join(dir, "pkg", "node_modules"), { recursive: true });
    await fs.writeFile(path.join(dir, "pkg", "node_modules", "deep.txt"), "");
    await fs.writeFile(path.join(dir, "pkg", "keep.txt"), "");
  });

  async function search(excludePatterns: string[]): Promise<string[]> {
    const result = await call(conn.client, "search_files", {
      path: dir,
      pattern: "**/*.txt",
      excludePatterns,
    });
    return textOf(result).split("\n").sort();
  }

  it("directory_tree: a name with no '*' is left out at any depth", async () => {
    const result = await call(conn.client, "directory_tree", {
      path: dir,
      excludePatterns: ["node_modules"],
    });
    const text = textOf(result);
    expect(text).not.toContain("node_modules");
    expect(text).toContain("keep.txt");
  });

  it("search_files: a bare name skips only the top-level entry", async () => {
    expect(await search(["node_modules"])).toEqual([
      path.join(dir, "pkg", "keep.txt"),
      path.join(dir, "pkg", "node_modules", "deep.txt"),
    ]);
  });

  it("search_files: '**/node_modules' skips that name at any depth", async () => {
    expect(await search(["**/node_modules"])).toEqual([
      path.join(dir, "pkg", "keep.txt"),
    ]);
  });
});
