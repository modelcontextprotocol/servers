// Protocol-level tests for the copy_file tool (#519), driven through a real
// Client over an in-memory transport. They pin the contract the README states:
// one regular file is copied with its permissions and modification time, the
// source is left as it was, an existing destination is never overwritten,
// directories and anything else that is not a regular file are refused, and
// both paths go through the allowed-directory checks.

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
  dir = await makeTempDir("mcp-fs-copy-");
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("copy_file", () => {
  it("is listed right after move_file, with truthful annotations", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names.indexOf("copy_file")).toBe(names.indexOf("move_file") + 1);
    const tool = tools.find((t) => t.name === "copy_file");
    expect(tool?.title).toBe("Copy File");
    expect(tool?.annotations).toEqual({
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });

  it("copies a file, leaving the source as it was", async () => {
    const source = path.join(dir, "a.txt");
    const destination = path.join(dir, "b.txt");
    await fs.writeFile(source, "alpha\r\nbeta");
    const result = await call(client, "copy_file", { source, destination });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      `Successfully copied ${source} to ${destination}`,
    );
    expect(result.structuredContent).toEqual({ content: textOf(result) });
    expect(await fs.readFile(destination, "utf-8")).toBe("alpha\r\nbeta");
    expect(await fs.readFile(source, "utf-8")).toBe("alpha\r\nbeta");
    const [sourceStat, copyStat] = await Promise.all([
      fs.stat(source, { bigint: true }),
      fs.stat(destination, { bigint: true }),
    ]);
    expect(copyStat.ino).not.toBe(sourceStat.ino);
  });

  it("copies binary content byte for byte, into another directory", async () => {
    const bytes = Buffer.from(
      Array.from({ length: 200_000 }, (_, i) => (i * 7) % 256),
    );
    const source = path.join(dir, "blob.bin");
    await fs.mkdir(path.join(dir, "sub"));
    const destination = path.join(dir, "sub", "blob-copy.bin");
    await fs.writeFile(source, bytes);
    const result = await call(client, "copy_file", { source, destination });
    expect(result.isError).toBeFalsy();
    expect((await fs.readFile(destination)).equals(bytes)).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "keeps the source's permissions and modification time",
    async () => {
      const source = path.join(dir, "script.sh");
      const destination = path.join(dir, "script-copy.sh");
      await fs.writeFile(source, "#!/bin/sh\n");
      await fs.chmod(source, 0o750);
      const mtime = new Date("2001-02-03T04:05:06Z");
      await fs.utimes(source, mtime, mtime);
      const result = await call(client, "copy_file", { source, destination });
      expect(result.isError).toBeFalsy();
      const copied = await fs.stat(destination);
      expect(copied.mode & 0o777).toBe(0o750);
      expect(copied.mtime.getTime()).toBe(mtime.getTime());
    },
  );

  it("refuses an existing destination and leaves it untouched", async () => {
    const source = path.join(dir, "a.txt");
    const destination = path.join(dir, "b.txt");
    await fs.writeFile(source, "new");
    await fs.writeFile(destination, "keep me");
    const result = await call(client, "copy_file", { source, destination });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Destination already exists: ${destination}`);
    expect(await fs.readFile(destination, "utf-8")).toBe("keep me");
  });

  it("refuses a copy onto itself", async () => {
    const source = path.join(dir, "a.txt");
    await fs.writeFile(source, "same");
    const result = await call(client, "copy_file", {
      source,
      destination: source,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Destination already exists: ${source}`);
    expect(await fs.readFile(source, "utf-8")).toBe("same");
  });

  it.skipIf(process.platform === "win32")(
    "refuses a destination occupied by a dangling symlink, without following it",
    async () => {
      const source = path.join(dir, "a.txt");
      const destination = path.join(dir, "link.txt");
      const target = path.join(dir, "would-be-created.txt");
      await fs.writeFile(source, "x");
      await fs.symlink(target, destination);
      const result = await call(client, "copy_file", { source, destination });
      expect(result.isError).toBe(true);
      expect(fsSync.existsSync(target)).toBe(false);
    },
  );

  it("refuses a directory", async () => {
    const source = path.join(dir, "folder");
    await fs.mkdir(source);
    const result = await call(client, "copy_file", {
      source,
      destination: path.join(dir, "folder-copy"),
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^Cannot copy a directory: /);
    expect(fsSync.existsSync(path.join(dir, "folder-copy"))).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "refuses a source that is not a regular file",
    async () => {
      const source = path.join(dir, "fifo");
      const { execFileSync } = await import("child_process");
      execFileSync("mkfifo", [source]);
      const result = await call(client, "copy_file", {
        source,
        destination: path.join(dir, "fifo-copy"),
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(`Cannot copy: not a regular file: ${source}`);
    },
  );

  it("removes the copy when closing the source fails after it", async () => {
    const source = path.join(dir, "a.txt");
    const destination = path.join(dir, "b.txt");
    await fs.writeFile(source, "data");
    // The copy closes the destination first, then the source: fail the
    // second close, after really closing the descriptor.
    const realClose = fsSync.close;
    let closes = 0;
    vi.spyOn(fsSync, "close").mockImplementation(((
      fd: number,
      callback: (error: NodeJS.ErrnoException | null) => void,
    ) =>
      realClose(fd, (error) =>
        ++closes === 2
          ? callback(
              Object.assign(new Error("EIO: i/o error, close"), {
                code: "EIO",
              }),
            )
          : callback(error),
      )) as typeof fsSync.close);
    const result = await call(client, "copy_file", { source, destination });
    expect(closes).toBe(2);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("EIO: i/o error, close");
    expect(fsSync.existsSync(destination)).toBe(false);
    expect(await fs.readFile(source, "utf-8")).toBe("data");
  });

  it("reports a missing source", async () => {
    const result = await call(client, "copy_file", {
      source: path.join(dir, "missing.txt"),
      destination: path.join(dir, "copy.txt"),
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/ENOENT/);
    expect(fsSync.existsSync(path.join(dir, "copy.txt"))).toBe(false);
  });

  it("refuses a source or destination outside the allowed directories", async () => {
    const outside = await makeTempDir("mcp-fs-copy-outside-");
    try {
      const secret = path.join(outside, "secret.txt");
      await fs.writeFile(secret, "SECRET");
      const inside = path.join(dir, "a.txt");
      await fs.writeFile(inside, "a");

      const fromOutside = await call(client, "copy_file", {
        source: secret,
        destination: path.join(dir, "stolen.txt"),
      });
      expect(fromOutside.isError).toBe(true);
      expect(textOf(fromOutside)).toMatch(/^Access denied/);
      expect(fsSync.existsSync(path.join(dir, "stolen.txt"))).toBe(false);

      const toOutside = await call(client, "copy_file", {
        source: inside,
        destination: path.join(outside, "leaked.txt"),
      });
      expect(toOutside.isError).toBe(true);
      expect(textOf(toOutside)).toMatch(/^Access denied/);
      expect(fsSync.existsSync(path.join(outside, "leaked.txt"))).toBe(false);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "refuses a symlink inside that points outside",
    async () => {
      const outside = await makeTempDir("mcp-fs-copy-outside-");
      try {
        await fs.writeFile(path.join(outside, "secret.txt"), "SECRET");
        const link = path.join(dir, "link.txt");
        await fs.symlink(path.join(outside, "secret.txt"), link);
        const result = await call(client, "copy_file", {
          source: link,
          destination: path.join(dir, "stolen.txt"),
        });
        expect(result.isError).toBe(true);
        expect(textOf(result)).toMatch(/^Access denied/);
        expect(fsSync.existsSync(path.join(dir, "stolen.txt"))).toBe(false);
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    },
  );

  it("reports a destination whose state it cannot read", async () => {
    const source = path.join(dir, "a.txt");
    await fs.writeFile(source, "x");
    const destination = path.join(dir, "copy.txt");
    // Validation lstats the missing destination first; the existence check
    // after it is the call that fails here, as it would for a directory made
    // unreadable in between.
    const realLstat = fs.lstat.bind(fs);
    let seen = 0;
    vi.spyOn(fs, "lstat").mockImplementation(((p: string, opts?: unknown) => {
      if (p === destination && ++seen === 2) {
        return Promise.reject(
          Object.assign(new Error("EACCES: permission denied, lstat"), {
            code: "EACCES",
          }),
        );
      }
      return realLstat(p, opts as never);
    }) as typeof fs.lstat);
    const result = await call(client, "copy_file", { source, destination });
    expect(seen).toBe(2);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("EACCES: permission denied, lstat");
    expect(fsSync.existsSync(destination)).toBe(false);
  });
});

// The TOCTOU window, as server-tools.test.ts stages it for move_file: the
// destination's directory is swapped for a symlink to a directory outside the
// allowed one right after validation resolved it. copy_file must not create
// its copy through it.
describe.skipIf(process.platform === "win32")(
  "copy_file with the destination's directory swapped for a symlink after validation",
  () => {
    let outside: string;
    let flip: string;

    beforeEach(async () => {
      outside = await makeTempDir("mcp-fs-copy-outside-");
      flip = path.join(dir, "flip");
      await fs.mkdir(flip);
    });

    afterEach(async () => {
      await fs.rm(outside, { recursive: true, force: true });
    });

    it("does not create the copy through it", async () => {
      const source = path.join(dir, "a.txt");
      await fs.writeFile(source, "data");
      const realRealpath = fs.realpath.bind(fs);
      let swapped = false;
      vi.spyOn(fs, "realpath").mockImplementation(async (p, opts) => {
        const resolved = await realRealpath(p, opts);
        if (!swapped && p === flip) {
          swapped = true;
          fsSync.renameSync(flip, path.join(dir, "flip-real"));
          fsSync.symlinkSync(outside, flip);
        }
        return resolved;
      });
      const result = await call(client, "copy_file", {
        source,
        destination: path.join(flip, "copy.txt"),
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/^Access denied/);
      expect(await fs.readdir(outside)).toEqual([]);
    });
  },
);
