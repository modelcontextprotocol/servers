// The device-name and trailing dot/space refusals (#5444) on the real host,
// with no path simulation. On Windows (the CI Windows leg) the tools refuse
// a device name and a trailing-dot name and write nothing. On POSIX those are
// ordinary, distinct file names, so they must keep working: the refusal is
// Windows-only.

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

const DEVICE = /Windows reserved device names .* are not supported/;
const TRAILING = /ending in a dot or a space are not supported/;

let dir: string;
let conn: Connected;

beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-devnames-");
  conn = await connect([dir]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe.runIf(process.platform === "win32")("on Windows", () => {
  it("refuses a device name and a trailing dot or space", async () => {
    const write = await call(conn.client, "write_file", {
      path: path.join(dir, "NUL.txt"),
      content: "payload",
    });
    expect(write.isError).toBe(true);
    expect(textOf(write)).toMatch(DEVICE);

    await fs.writeFile(path.join(dir, "notes.txt"), "visible");
    const dotted = await call(conn.client, "write_file", {
      path: `${path.join(dir, "notes.txt")}.`,
      content: "overwritten",
    });
    expect(dotted.isError).toBe(true);
    expect(textOf(dotted)).toMatch(TRAILING);
    expect(await fs.readFile(path.join(dir, "notes.txt"), "utf8")).toBe(
      "visible",
    );

    const spaced = await call(conn.client, "read_text_file", {
      path: `${path.join(dir, "notes.txt")} `,
    });
    expect(spaced.isError).toBe(true);
    expect(textOf(spaced)).toMatch(TRAILING);
  });
});

describe.skipIf(process.platform === "win32")("on POSIX", () => {
  it.each(["NUL", "con.txt", "COM1", "trailing.", "trailing "])(
    "still writes and reads a file named %j",
    async (name) => {
      const file = path.join(dir, name);
      const write = await call(conn.client, "write_file", {
        path: file,
        content: `plain ${name}`,
      });
      expect(write.isError).toBeFalsy();
      expect(await fs.readFile(file, "utf8")).toBe(`plain ${name}`);

      const read = await call(conn.client, "read_text_file", { path: file });
      expect(read.isError).toBeFalsy();
      expect(textOf(read)).toBe(`plain ${name}`);
    },
  );
});
