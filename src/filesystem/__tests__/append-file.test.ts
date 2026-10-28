// Protocol-level tests for the append_file tool (#1208), driven through a real
// Client over an in-memory transport. They pin the contract the README states:
// text is appended exactly as given (no newline added), a missing file is
// created, the existing content and the file's identity are kept, and the
// write takes the same symlink-safe path as write_file, so nothing swapped in
// after validation is written through.

import fs from "fs/promises";
import fsSync from "fs";
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
  dir = await makeTempDir("mcp-fs-append-");
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("append_file", () => {
  it("is listed right after write_file, with truthful annotations", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names.indexOf("append_file")).toBe(names.indexOf("write_file") + 1);
    const tool = tools.find((t) => t.name === "append_file");
    expect(tool?.title).toBe("Append File");
    expect(tool?.annotations).toEqual({
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
  });

  it("appends to an existing file exactly as given, adding no newline", async () => {
    const file = path.join(dir, "log.txt");
    await fs.writeFile(file, "first");
    const result = await call(client, "append_file", {
      path: file,
      content: " second",
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(`Successfully appended to ${file}`);
    expect(result.structuredContent).toEqual({ content: textOf(result) });
    expect(await fs.readFile(file, "utf-8")).toBe("first second");
  });

  it("builds a file up line by line when each append ends in a newline", async () => {
    const file = path.join(dir, "lines.txt");
    for (const line of ["one\n", "two\n", "three\n"]) {
      const result = await call(client, "append_file", {
        path: file,
        content: line,
      });
      expect(result.isError).toBeFalsy();
    }
    expect(await fs.readFile(file, "utf-8")).toBe("one\ntwo\nthree\n");
  });

  it("keeps CRLF and other content byte for byte", async () => {
    const file = path.join(dir, "crlf.txt");
    await fs.writeFile(file, "a\r\n");
    await call(client, "append_file", { path: file, content: "b\r\nc" });
    expect(await fs.readFile(file, "utf-8")).toBe("a\r\nb\r\nc");
  });

  it("creates a file that does not exist yet", async () => {
    const file = path.join(dir, "new.txt");
    const result = await call(client, "append_file", {
      path: file,
      content: "hello",
    });
    expect(result.isError).toBeFalsy();
    expect(await fs.readFile(file, "utf-8")).toBe("hello");
  });

  it("leaves a file unchanged when the content is empty", async () => {
    const file = path.join(dir, "same.txt");
    await fs.writeFile(file, "kept");
    const result = await call(client, "append_file", {
      path: file,
      content: "",
    });
    expect(result.isError).toBeFalsy();
    expect(await fs.readFile(file, "utf-8")).toBe("kept");
  });

  it("appends through the existing file, keeping its inode and hard links", async () => {
    const file = path.join(dir, "linked.txt");
    const link = path.join(dir, "other-name.txt");
    await fs.writeFile(file, "base");
    await fs.link(file, link);
    const before = await fs.stat(file, { bigint: true });
    await call(client, "append_file", { path: file, content: "+more" });
    const after = await fs.stat(file, { bigint: true });
    expect(after.ino).toBe(before.ino);
    expect(after.nlink).toBe(2n);
    expect(await fs.readFile(link, "utf-8")).toBe("base+more");
  });

  it("refuses a path outside the allowed directories", async () => {
    const outside = await makeTempDir("mcp-fs-append-outside-");
    try {
      const target = path.join(outside, "x.txt");
      const result = await call(client, "append_file", {
        path: target,
        content: "nope",
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/^Access denied/);
      expect(fsSync.existsSync(target)).toBe(false);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("refuses a directory", async () => {
    const sub = path.join(dir, "sub");
    await fs.mkdir(sub);
    const result = await call(client, "append_file", {
      path: sub,
      content: "x",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `Refusing to append: not a regular file: ${sub}`,
    );
  });

  it("fails, creating nothing, when the parent directory does not exist", async () => {
    const result = await call(client, "append_file", {
      path: path.join(dir, "missing", "x.txt"),
      content: "x",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/ENOENT/);
    expect(fsSync.existsSync(path.join(dir, "missing"))).toBe(false);
  });

  it("refuses when the file at the path is not the one it opened", async () => {
    const file = path.join(dir, "target.txt");
    const decoy = path.join(dir, "decoy.txt");
    await fs.writeFile(file, "original");
    await fs.writeFile(decoy, "decoy");
    // The lstat that names the file to append to describes another file, as
    // if the target had been replaced between that lstat and the open.
    const realLstat = fs.lstat.bind(fs);
    vi.spyOn(fs, "lstat").mockImplementation(((p: string, opts?: unknown) =>
      realLstat(p === file ? decoy : p, opts as never)) as typeof fs.lstat);
    const result = await call(client, "append_file", {
      path: file,
      content: "pwned",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `Refusing to append: ${file} was replaced while it was being opened`,
    );
    expect(await fs.readFile(file, "utf-8")).toBe("original");
    expect(await fs.readFile(decoy, "utf-8")).toBe("decoy");
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports a file it cannot create",
    async () => {
      const locked = path.join(dir, "locked");
      await fs.mkdir(locked);
      await fs.chmod(locked, 0o500);
      try {
        const result = await call(client, "append_file", {
          path: path.join(locked, "x.txt"),
          content: "x",
        });
        expect(result.isError).toBe(true);
        expect(textOf(result)).toMatch(/EACCES/);
      } finally {
        await fs.chmod(locked, 0o700);
      }
    },
  );
});

// The TOCTOU window, as server-tools.test.ts stages it for write_file: a
// directory on the path is swapped for a symlink to a directory outside the
// allowed one right after validation resolved the path. append_file must not
// write through it, whether it would create the file or append to one.
describe.skipIf(process.platform === "win32")(
  "append_file with a directory on the path swapped for a symlink after validation",
  () => {
    let outside: string;
    let flip: string;
    let flipReal: string;

    beforeEach(async () => {
      outside = await makeTempDir("mcp-fs-append-outside-");
      flip = path.join(dir, "flip");
      flipReal = path.join(dir, "flip-real");
      await fs.mkdir(flip);
    });

    afterEach(async () => {
      await fs.rm(outside, { recursive: true, force: true });
    });

    /** Swap `flip` for a symlink to `outside` once validation realpath'd `target`. */
    const swapAfterRealpath = (target: string) => {
      const realRealpath = fs.realpath.bind(fs);
      let swapped = false;
      vi.spyOn(fs, "realpath").mockImplementation(async (p, opts) => {
        const resolved = await realRealpath(p, opts);
        if (!swapped && p === target) {
          swapped = true;
          fsSync.renameSync(flip, flipReal);
          fsSync.symlinkSync(outside, flip);
        }
        return resolved;
      });
    };

    it("does not create a file through it", async () => {
      swapAfterRealpath(flip);
      const result = await call(client, "append_file", {
        path: path.join(flip, "created.txt"),
        content: "pwned",
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/^Access denied/);
      expect(await fs.readdir(outside)).toEqual([]);
    });

    it("does not append to a file through it", async () => {
      const victim = path.join(flip, "victim.txt");
      await fs.writeFile(victim, "original");
      await fs.writeFile(path.join(outside, "victim.txt"), "SECRET");
      swapAfterRealpath(victim);
      const result = await call(client, "append_file", {
        path: victim,
        content: "pwned",
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/^Access denied/);
      expect(await fs.readFile(path.join(outside, "victim.txt"), "utf-8")).toBe(
        "SECRET",
      );
      expect(
        await fs.readFile(path.join(flipReal, "victim.txt"), "utf-8"),
      ).toBe("original");
    });
  },
);
