// What the list_directory and list_directory_with_sizes descriptions tell a
// model (#5071). The two used to be the same text apart from ", including
// sizes", so neither said when to pick it over the other. Each now names its
// sibling; these tests read the descriptions through tools/list, check that
// every tool they point to is registered, and check the one claim the
// server-tools suite does not already cover: list_directory is not recursive.
import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tool } from "@modelcontextprotocol/client";
import {
  call,
  connect,
  makeTempDir,
  quietStderr,
  textOf,
  type Connected,
} from "./helpers.js";

let dir: string;
let conn: Connected;
let tools: Tool[];

beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-list-desc-");
  conn = await connect([dir]);
  ({ tools } = await conn.client.listTools());
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

function descriptionOf(name: string): string {
  const description = tools.find((t) => t.name === name)?.description;
  if (description === undefined) throw new Error(`no description: ${name}`);
  return description;
}

describe("list tool descriptions (#5071)", () => {
  it("list_directory names list_directory_with_sizes and directory_tree", () => {
    const description = descriptionOf("list_directory");
    expect(description).toContain("use list_directory_with_sizes instead");
    expect(description).toContain("use directory_tree");
    expect(description).toContain("directly inside a path");
  });

  it("list_directory_with_sizes names list_directory, sortBy and the totals", () => {
    const description = descriptionOf("list_directory_with_sizes");
    expect(description).toContain("use list_directory");
    expect(description).toContain("sorted by name or by size, largest first");
    expect(description).toContain("(sortBy)");
    expect(description).toContain("followed by the totals");
  });

  it("names only tools the server registers", () => {
    const names = new Set(tools.map((t) => t.name));
    for (const tool of ["list_directory", "list_directory_with_sizes"]) {
      for (const named of descriptionOf(tool).match(/\b[a-z]+_[a-z_]+\b/g) ??
        []) {
        expect(names, `${tool} names ${named}`).toContain(named);
      }
    }
  });

  it("list_directory lists only the entries directly inside the path", async () => {
    await fs.mkdir(path.join(dir, "sub"));
    await fs.writeFile(path.join(dir, "sub", "nested.txt"), "");
    const text = textOf(
      await call(conn.client, "list_directory", { path: dir }),
    );
    expect(text).toBe("[DIR] sub");
  });
});
