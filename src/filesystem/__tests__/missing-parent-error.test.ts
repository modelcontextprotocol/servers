// A write whose parent directory is missing reports the documented
// "Parent directory does not exist: <path>" error (#5432), never the raw
// chdir error of the pinned write, which named chdir (an implementation
// detail) and the server's own working directory (wherever it was launched,
// possibly outside the allowed directories). The protocol-level tests drive
// each pinned write through a client; the unit tests below them cover the
// error mapping's other branches in pinned-directory.ts directly.

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/client";
import { createFileInDirectory } from "../pinned-directory.js";
import {
  call,
  connect,
  makeTempDir,
  quietStderr,
  textOf,
  type Connected,
} from "./helpers.js";

let dir: string;
let cwd: string;
let conn: Connected;
let client: Client;

beforeEach(async () => {
  quietStderr();
  cwd = process.cwd();
  dir = await makeTempDir("mcp-fs-missing-parent-");
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.chdir(cwd);
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

/** The error text must not leak the server's working directory or chdir. */
function expectNoLeak(text: string): void {
  expect(text).not.toContain(cwd);
  expect(text).not.toMatch(/chdir/);
}

describe("a write into a missing directory (#5432)", () => {
  it("write_file reports the missing parent", async () => {
    const missing = path.join(dir, "nope");
    const result = await call(client, "write_file", {
      path: path.join(missing, "x.txt"),
      content: "z",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Parent directory does not exist: ${missing}`);
    expect(fsSync.existsSync(missing)).toBe(false);
  });

  it("write_file reports the missing parent several levels down", async () => {
    const missing = path.join(dir, "no", "such");
    const result = await call(client, "write_file", {
      path: path.join(missing, "file.txt"),
      content: "z",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Parent directory does not exist: ${missing}`);
  });

  it("append_file reports the missing parent", async () => {
    const missing = path.join(dir, "nope");
    const result = await call(client, "append_file", {
      path: path.join(missing, "x.txt"),
      content: "z",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Parent directory does not exist: ${missing}`);
    expect(fsSync.existsSync(missing)).toBe(false);
  });

  it("move_file reports the destination's missing parent", async () => {
    const source = path.join(dir, "a.txt");
    await fs.writeFile(source, "a");
    const missing = path.join(dir, "nope");
    const result = await call(client, "move_file", {
      source,
      destination: path.join(missing, "a.txt"),
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Parent directory does not exist: ${missing}`);
    expect(await fs.readFile(source, "utf-8")).toBe("a");
  });

  it("copy_file reports the destination's missing parent", async () => {
    const source = path.join(dir, "a.txt");
    await fs.writeFile(source, "a");
    const missing = path.join(dir, "nope");
    const result = await call(client, "copy_file", {
      source,
      destination: path.join(missing, "a.txt"),
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Parent directory does not exist: ${missing}`);
    expect(fsSync.existsSync(missing)).toBe(false);
  });

  it("edit_file on a file in a missing directory leaks nothing", async () => {
    const result = await call(client, "edit_file", {
      path: path.join(dir, "nope", "x.txt"),
      edits: [{ oldText: "a", newText: "b" }],
    });
    expect(result.isError).toBe(true);
    expectNoLeak(textOf(result));
  });

  it("create_directory still creates missing parents, and leaks nothing on a file in the way", async () => {
    const created = await call(client, "create_directory", {
      path: path.join(dir, "a", "b"),
    });
    expect(created.isError).toBeFalsy();
    await fs.writeFile(path.join(dir, "file"), "");
    const result = await call(client, "create_directory", {
      path: path.join(dir, "file", "below"),
    });
    expect(result.isError).toBe(true);
    expectNoLeak(textOf(result));
  });
});

describe("the pinned write's error for a directory it cannot enter", () => {
  it("reports a file in place of the parent as a missing parent", async () => {
    await fs.writeFile(path.join(dir, "file"), "");
    const parent = path.join(dir, "file");
    await expect(
      createFileInDirectory(path.join(parent, "x.txt"), "z"),
    ).rejects.toThrow(
      expect.objectContaining({
        message: `Parent directory does not exist: ${parent}`,
        // Windows reports a file in the way of chdir as ENOENT.
        code: process.platform === "win32" ? "ENOENT" : "ENOTDIR",
      }),
    );
  });

  it("keeps any other failure's code and names only the directory", async () => {
    const realChdir = process.chdir.bind(process);
    vi.spyOn(process, "chdir").mockImplementation((directory) => {
      if (directory === dir) {
        throw Object.assign(
          new Error(`EACCES: permission denied, chdir '${cwd}' -> '${dir}'`),
          { code: "EACCES" },
        );
      }
      realChdir(directory);
    });
    await expect(
      createFileInDirectory(path.join(dir, "x.txt"), "z"),
    ).rejects.toThrow(
      expect.objectContaining({
        message: `EACCES: cannot enter directory: ${dir}`,
        code: "EACCES",
      }),
    );
  });

  it("reports a failure with no code without leaking its message", async () => {
    const realChdir = process.chdir.bind(process);
    vi.spyOn(process, "chdir").mockImplementation((directory) => {
      if (directory === dir) {
        throw new Error(`chdir '${cwd}' -> '${dir}'`);
      }
      realChdir(directory);
    });
    await expect(
      createFileInDirectory(path.join(dir, "x.txt"), "z"),
    ).rejects.toThrow(`Error: cannot enter directory: ${dir}`);
  });
});
