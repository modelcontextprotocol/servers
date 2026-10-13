// Real-filesystem regressions for the append tools, called through the MCP
// client. Mocks alone missed the missing-file creation bug in PR #2816;
// controlled path swaps below exercise the validation/open boundary too.

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

let dir: string;
let outside: string;
let conn: Connected;

beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-append-");
  outside = await makeTempDir("mcp-fs-append-outside-");
  conn = await connect([dir]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

describe("append_file", () => {
  it("adds exact bytes at physical EOF without replacing the inode or hard links", async () => {
    const file = path.join(dir, "existing.bin");
    const alias = path.join(dir, "hard-link.bin");
    const original = Buffer.from([0x00, 0xff, 0x41, 0x0d, 0x0a]);
    await fs.writeFile(file, original);
    await fs.link(file, alias);
    const before = await fs.stat(file);
    const held = await fs.open(file, "r");
    try {
      const result = await call(conn.client, "append_file", {
        path: file,
        content: "héllo",
      });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({ content: textOf(result) });
      const expected = Buffer.concat([original, Buffer.from("héllo")]);
      expect(await fs.readFile(file)).toEqual(expected);
      expect(await fs.readFile(alias)).toEqual(expected);
      const after = await fs.stat(file);
      expect([after.dev, after.ino, after.mode]).toEqual([
        before.dev,
        before.ino,
        before.mode,
      ]);
      expect((await held.stat()).size).toBe(expected.length);
    } finally {
      await held.close();
    }
  });

  it.each(["hello", ""])(
    "rejects a missing file and leaves it missing (content %j)",
    async (content) => {
      const file = path.join(dir, "missing.txt");
      const result = await call(conn.client, "append_file", {
        path: file,
        content,
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(`File does not exist: ${file}`);
      await expect(fs.lstat(file)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("appends to an empty existing file", async () => {
    const file = path.join(dir, "empty.txt");
    await fs.writeFile(file, "");
    expect(
      (await call(conn.client, "append_file", { path: file, content: "first" }))
        .isError,
    ).toBeFalsy();
    expect(await fs.readFile(file, "utf-8")).toBe("first");
  });

  it("preserves every concurrent append without replacing earlier content", async () => {
    const file = path.join(dir, "log.txt");
    await fs.writeFile(file, "prefix\n");
    const records = Array.from({ length: 8 }, (_, i) => `entry-${i}\n`);
    const results = await Promise.all(
      records.map((content) =>
        call(conn.client, "append_file", { path: file, content }),
      ),
    );
    expect(results.every((result) => !result.isError)).toBe(true);
    const lines = (await fs.readFile(file, "utf-8")).split("\n");
    expect(lines.shift()).toBe("prefix");
    expect(lines.pop()).toBe("");
    expect(lines.sort()).toEqual(records.map((record) => record.trim()).sort());
  });

  it("allows a validated symlink to a file inside the allowed directory", async () => {
    const file = path.join(dir, "target.txt");
    const link = path.join(dir, "link.txt");
    await fs.writeFile(file, "before");
    await fs.symlink(file, link, "file");
    expect(
      (await call(conn.client, "append_file", { path: link, content: "after" }))
        .isError,
    ).toBeFalsy();
    expect(await fs.readFile(file, "utf-8")).toBe("beforeafter");
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
  });
});

describe("create_or_append_file", () => {
  it("creates a missing file and reports the actual operation", async () => {
    const file = path.join(dir, "new.txt");
    const result = await call(conn.client, "create_or_append_file", {
      path: file,
      content: "initial",
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(`Successfully created ${file} with content`);
    expect(result.structuredContent).toEqual({ content: textOf(result) });
    expect(await fs.readFile(file, "utf-8")).toBe("initial");
  });

  it("appends to an existing file without replacing its inode", async () => {
    const file = path.join(dir, "existing.txt");
    await fs.writeFile(file, "before");
    const before = await fs.stat(file);
    const result = await call(conn.client, "create_or_append_file", {
      path: file,
      content: "after",
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(`Successfully appended content to ${file}`);
    expect(await fs.readFile(file, "utf-8")).toBe("beforeafter");
    expect((await fs.stat(file)).ino).toBe(before.ino);
  });

  it("appends rather than overwriting when another process wins creation", async () => {
    const file = path.join(dir, "race.txt");
    const open = fs.open.bind(fs);
    vi.spyOn(fs, "open").mockImplementationOnce(
      async (filePath, flags, mode) => {
        expect(flags).toBe("wx");
        await fs.writeFile(file, "competitor");
        return open(filePath, flags, mode);
      },
    );
    const result = await call(conn.client, "create_or_append_file", {
      path: file,
      content: "+ours",
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(`Successfully appended content to ${file}`);
    expect(await fs.readFile(file, "utf-8")).toBe("competitor+ours");
  });
});

describe.each(["append_file", "create_or_append_file"])(
  "%s validation",
  (tool) => {
    it("refuses an out-of-bounds symlink target", async () => {
      const target = path.join(outside, "untouched.txt");
      const link = path.join(dir, "link.txt");
      await fs.writeFile(target, "outside");
      await fs.symlink(target, link, "file");
      const result = await call(conn.client, tool, {
        path: link,
        content: "bad",
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(
        "symlink target outside allowed directories",
      );
      expect(await fs.readFile(target, "utf-8")).toBe("outside");
    });

    it("refuses a symlink swapped in between validation and lstat", async () => {
      const file = path.join(dir, "file.txt");
      const target = path.join(outside, "untouched.txt");
      await fs.writeFile(file, "before");
      await fs.writeFile(target, "outside");
      const lstat = fs.lstat.bind(fs);
      vi.spyOn(fs, "lstat").mockImplementationOnce(async (filePath) => {
        await fs.unlink(file);
        await fs.symlink(target, file, "file");
        return lstat(filePath);
      });
      const result = await call(conn.client, tool, {
        path: file,
        content: "bad",
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("not a regular file");
      expect(await fs.readFile(target, "utf-8")).toBe("outside");
    });

    it("refuses a symlink swapped in between lstat and open", async () => {
      const file = path.join(dir, "file.txt");
      const target = path.join(outside, "untouched.txt");
      await fs.writeFile(file, "before");
      await fs.writeFile(target, "outside");
      const open = fs.open.bind(fs);
      vi.spyOn(fs, "open").mockImplementationOnce(
        async (filePath, flags, mode) => {
          await fs.rename(file, path.join(dir, "original.txt"));
          await fs.symlink(target, file, "file");
          return open(filePath, flags, mode);
        },
      );
      const result = await call(conn.client, tool, {
        path: file,
        content: "bad",
      });
      expect(result.isError).toBe(true);
      expect(await fs.readFile(target, "utf-8")).toBe("outside");
      expect(await fs.readFile(path.join(dir, "original.txt"), "utf-8")).toBe(
        "before",
      );
    });

    it("refuses a different regular file swapped in before open", async () => {
      const file = path.join(dir, "file.txt");
      await fs.writeFile(file, "before");
      const open = fs.open.bind(fs);
      vi.spyOn(fs, "open").mockImplementationOnce(
        async (filePath, flags, mode) => {
          await fs.rename(file, path.join(dir, "original.txt"));
          await fs.writeFile(file, "replacement");
          return open(filePath, flags, mode);
        },
      );
      const result = await call(conn.client, tool, {
        path: file,
        content: "bad",
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(
        "was replaced while it was being opened",
      );
      expect(await fs.readFile(file, "utf-8")).toBe("replacement");
    });
  },
);
