// Protocol-level tests that every read is anchored to the file validation
// resolved, as every write is (pinned-directory.ts). The swap an attacker
// would race is staged deterministically: right after validation realpath's
// the requested path, a directory on it is swapped for a symlink to a
// directory outside the allowed one (or the file itself is swapped for a
// symlink or a FIFO). Each read must then refuse rather than return, or block
// on, what the swap put there. Before reads were anchored, each of these
// returned the outside file's content or size.

import fs from "fs/promises";
import fsSync from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProtocolError, type Client } from "@modelcontextprotocol/client";
import {
  call,
  connect,
  makeTempDir,
  quietStderr,
  textOf,
  type Connected,
} from "./helpers.js";

// Distinct content and sizes inside and outside, so a leak of either the
// content or the size shows.
const INSIDE = "inside\n";
const SECRET = "SECRET-outside-the-allowed-directory-0123456789\n";

let dir: string;
let outside: string;
let flip: string;
let flipReal: string;
let target: string;
let conn: Connected;
let client: Client;

beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-read-anchor-");
  outside = await makeTempDir("mcp-fs-read-anchor-outside-");
  flip = path.join(dir, "flip");
  flipReal = path.join(dir, "flip-real");
  target = path.join(flip, "note.txt");
  await fs.mkdir(flip);
  await fs.writeFile(target, INSIDE);
  await fs.writeFile(path.join(outside, "note.txt"), SECRET);
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

/** Run `swap` once, right after validation realpath's `requested`. */
function swapAfterRealpath(requested: string, swap: () => void): void {
  const realRealpath = fs.realpath.bind(fs);
  let swapped = false;
  vi.spyOn(fs, "realpath").mockImplementation(async (p, opts) => {
    const resolved = await realRealpath(p, opts);
    if (!swapped && p === requested) {
      swapped = true;
      swap();
    }
    return resolved;
  });
}

/** Swap `flip` for a symlink to `outside`. */
function swapDirectory(): void {
  fsSync.renameSync(flip, flipReal);
  fsSync.symlinkSync(outside, flip);
}

const DIRECTORY_CHANGED = /^Access denied - a directory on the path changed/;

describe.skipIf(process.platform === "win32")(
  "a directory on the path swapped for a symlink after validation",
  () => {
    it.each([
      ["read_text_file", {}],
      ["read_text_file", { head: 5 }],
      ["read_text_file", { tail: 5 }],
      ["read_file", {}],
      ["read_media_file", {}],
    ])("%s %j does not read through it", async (tool, extra) => {
      swapAfterRealpath(target, swapDirectory);
      const result = await call(client, tool, { path: target, ...extra });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(DIRECTORY_CHANGED);
      expect(JSON.stringify(result)).not.toContain("SECRET");
      expect(JSON.stringify(result)).not.toContain(
        Buffer.from(SECRET).toString("base64"),
      );
    });

    it("read_multiple_files does not read through it", async () => {
      swapAfterRealpath(target, swapDirectory);
      const result = await call(client, "read_multiple_files", {
        paths: [target],
      });
      expect(textOf(result)).toMatch(
        new RegExp(`^${target}: Error - Access denied - a directory`),
      );
      expect(textOf(result)).not.toContain("SECRET");
    });

    it("edit_file with dryRun does not preview through it", async () => {
      swapAfterRealpath(target, swapDirectory);
      const result = await call(client, "edit_file", {
        path: target,
        edits: [{ oldText: "SECRET", newText: "x" }],
        dryRun: true,
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(DIRECTORY_CHANGED);
      expect(textOf(result)).not.toContain("outside-the-allowed");
    });

    it("get_file_info does not describe the file through it", async () => {
      swapAfterRealpath(target, swapDirectory);
      const result = await call(client, "get_file_info", { path: target });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(DIRECTORY_CHANGED);
      expect(textOf(result)).not.toContain(`size: ${SECRET.length}`);
    });

    it("list_directory_with_sizes does not size an entry through it", async () => {
      swapAfterRealpath(target, swapDirectory);
      const result = await call(client, "list_directory_with_sizes", {
        path: flip,
      });
      expect(result.isError).toBeFalsy();
      // Listed, but with its size unknown rather than the outside file's.
      expect(textOf(result)).toMatch(/\[FILE\] note\.txt\s+unknown/);
      expect(textOf(result)).not.toContain(`${SECRET.length} B`);
    });

    it("resources/read does not read through it", async () => {
      swapAfterRealpath(target, swapDirectory);
      const error = await client
        .readResource({ uri: pathToFileURL(target).href })
        .then(
          () => undefined,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(ProtocolError);
      expect((error as ProtocolError).message).toMatch(
        /Access denied - a directory on the path changed/,
      );
      expect((error as ProtocolError).message).not.toContain("SECRET");
    });
  },
);

describe.skipIf(process.platform === "win32")(
  "the file itself swapped after validation",
  () => {
    it("is not read through a symlink swapped in", async () => {
      swapAfterRealpath(target, () => {
        fsSync.unlinkSync(target);
        fsSync.symlinkSync(path.join(outside, "note.txt"), target);
      });
      const result = await call(client, "read_text_file", { path: target });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(`Cannot read: not a regular file: ${target}`);
    });

    it("is not read, and does not block, when a FIFO is swapped in", async () => {
      swapAfterRealpath(target, () => {
        fsSync.unlinkSync(target);
        execFileSync("mkfifo", [target]);
      });
      const result = await call(client, "read_text_file", { path: target });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(`Cannot read: not a regular file: ${target}`);
    });
  },
);

describe("reads that are not swapped", () => {
  it("read every tool's way, from the file validation resolved", async () => {
    expect(textOf(await call(client, "read_text_file", { path: target }))).toBe(
      INSIDE,
    );
    expect(
      textOf(await call(client, "read_text_file", { path: target, tail: 1 })),
    ).toBe("inside");
    expect(
      textOf(await call(client, "read_text_file", { path: target, head: 1 })),
    ).toBe("inside");
    const info = textOf(await call(client, "get_file_info", { path: target }));
    expect(info).toContain(`size: ${INSIDE.length}`);
  });

  it("reports a missing file by its full path", async () => {
    const missing = path.join(dir, "missing.txt");
    const result = await call(client, "read_text_file", { path: missing });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `ENOENT: no such file or directory, lstat '${missing}'`,
    );
  });

  it("reports a directory as EISDIR, naming it", async () => {
    const result = await call(client, "read_text_file", { path: flip });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `EISDIR: illegal operation on a directory, read '${flip}'`,
    );
  });

  it("reports a missing file to get_file_info by its full path", async () => {
    const missing = path.join(dir, "missing.txt");
    const result = await call(client, "get_file_info", { path: missing });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `ENOENT: no such file or directory, lstat '${missing}'`,
    );
  });
});
