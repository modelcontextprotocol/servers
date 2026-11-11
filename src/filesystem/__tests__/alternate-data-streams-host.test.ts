// The alternate-data-stream refusal (#5375) on the real host, with no path
// simulation. On Windows (the CI Windows leg) a real NTFS stream path is
// refused by the tools and no stream is written. On POSIX a colon is an
// ordinary name character, so a file named with one must keep working:
// the refusal is Windows-only.

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

const REFUSAL = /NTFS alternate data stream paths are not supported/;

let dir: string;
let conn: Connected;

beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-ads-");
  conn = await connect([dir]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe.runIf(process.platform === "win32")("on Windows", () => {
  it("refuses to write or read a file's alternate stream", async () => {
    const file = path.join(dir, "notes.txt");
    await fs.writeFile(file, "visible");

    const write = await call(conn.client, "write_file", {
      path: `${file}:hidden`,
      content: "payload",
    });
    expect(write.isError).toBe(true);
    expect(textOf(write)).toMatch(REFUSAL);
    await expect(fs.readFile(`${file}:hidden`)).rejects.toThrow();

    const read = await call(conn.client, "read_text_file", {
      path: `${file}::$DATA`,
    });
    expect(read.isError).toBe(true);
    expect(textOf(read)).toMatch(REFUSAL);
  });
});

describe.skipIf(process.platform === "win32")("on POSIX", () => {
  it("still reads and writes a file whose name holds a colon", async () => {
    const file = path.join(dir, "notes.txt:not-a-stream");

    const write = await call(conn.client, "write_file", {
      path: file,
      content: "plain file",
    });
    expect(write.isError).toBeFalsy();
    expect(await fs.readFile(file, "utf8")).toBe("plain file");

    const read = await call(conn.client, "read_text_file", { path: file });
    expect(read.isError).toBeFalsy();
    expect(textOf(read)).toBe("plain file");
  });
});
