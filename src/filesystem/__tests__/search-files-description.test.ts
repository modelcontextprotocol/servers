// What the search_files description tells a model, checked against what the
// tool does (#896, #3419). Models read "search for files matching a pattern"
// as a content search (grep) and got "No matches found" for text that was in
// the files, so the description now says the tool matches names, never
// contents. These tests pin that wording and each matching rule it states, so
// the description cannot drift from the behavior again.

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

let dir: string;
let conn: Connected;
let client: Client;

beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-search-desc-");
  await fs.mkdir(path.join(dir, "src", "config"), { recursive: true });
  await fs.writeFile(path.join(dir, "notes.md"), "needle");
  await fs.writeFile(path.join(dir, "src", "app.md"), "");
  await fs.writeFile(path.join(dir, "config"), "");
  await fs.writeFile(path.join(dir, "README.MD"), "");
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

async function search(pattern: string): Promise<string[]> {
  const text = textOf(
    await call(client, "search_files", { path: dir, pattern }),
  );
  return text.split("\n").sort();
}

describe("search_files description (#896, #3419)", () => {
  it("says it matches names, not file contents", async () => {
    const { tools } = await client.listTools();
    const description = tools.find(
      (t) => t.name === "search_files",
    )?.description;
    expect(description).toMatch(
      /^Find files and directories by NAME, not by content/,
    );
    expect(description).toContain("never reads or searches inside files");
    expect(description).toContain("relative to 'path'");
    expect(description).not.toContain("working directory");
  });

  it("does not match a file's contents", async () => {
    expect(await search("**/needle")).toEqual(["No matches found"]);
  });

  it("matches '*.ext' only directly under path", async () => {
    expect(await search("*.md")).toEqual([path.join(dir, "notes.md")]);
  });

  it("matches '**/name' at any depth, the top level included", async () => {
    expect(await search("**/config")).toEqual([
      path.join(dir, "config"),
      path.join(dir, "src", "config"),
    ]);
  });

  it("matches case-sensitively", async () => {
    expect(await search("*.MD")).toEqual([path.join(dir, "README.MD")]);
  });
});
