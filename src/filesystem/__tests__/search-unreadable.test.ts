// search_files over a tree with a subdirectory it cannot read (#5189). The
// walk used to swallow that readdir failure with the validation errors it
// skips on purpose, so the result came back short with nothing to say so. Now
// the walk skips the directory, keeps going, and the tool names it after the
// matches. These tests make readdir fail for one directory by spying on the
// fs/promises object the server shares with this file, which works on every
// platform; one more test uses a real chmod 000 directory where POSIX
// permissions apply.

import fs from "fs/promises";
import type { PathLike } from "fs";
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
import { searchFilesWithValidation } from "../lib.js";

const realReaddir = fs.readdir.bind(fs);

let dir: string;
let conn: Connected;
let client: Client;

beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-unreadable-");
  await fs.mkdir(path.join(dir, "open"));
  await fs.mkdir(path.join(dir, "locked"));
  await fs.mkdir(path.join(dir, "sealed"));
  await fs.writeFile(path.join(dir, "open", "a.txt"), "");
  await fs.writeFile(path.join(dir, "locked", "hidden.txt"), "");
  await fs.writeFile(path.join(dir, "sealed", "also-hidden.txt"), "");
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.chmod(path.join(dir, "locked"), 0o755);
  await fs.rm(dir, { recursive: true, force: true });
});

/** Make readdir reject with `error` for each directory in `failing`. */
function failReaddir(failing: string[], error: Error): void {
  vi.spyOn(fs, "readdir").mockImplementation(((
    target: PathLike,
    ...rest: unknown[]
  ) =>
    failing.includes(target.toString())
      ? Promise.reject(error)
      : (
          realReaddir as (
            target: PathLike,
            ...rest: unknown[]
          ) => Promise<unknown>
        )(target, ...rest)) as typeof fs.readdir);
}

function eacces(): Error {
  return Object.assign(new Error("EACCES: permission denied"), {
    code: "EACCES",
  });
}

describe("search_files with an unreadable subdirectory (#5189)", () => {
  it("returns the matches it found and names the directory it could not read", async () => {
    const locked = path.join(dir, "locked");
    failReaddir([locked], eacces());
    const result = await call(client, "search_files", {
      path: dir,
      pattern: "**/*.txt",
    });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text.split("\n\n")).toEqual([
      expect.stringContaining(path.join(dir, "open", "a.txt")),
      "The search is incomplete: 1 directory could not be read, and any matches inside are missing:\n" +
        `${locked} (EACCES)`,
    ]);
    expect(text).toContain(path.join(dir, "sealed", "also-hidden.txt"));
    expect(text).not.toContain(path.join(locked, "hidden.txt"));
    expect(result.structuredContent).toEqual({ content: text });
  });

  it('says "No matches found" and lists every unreadable directory when nothing else matched', async () => {
    const locked = path.join(dir, "locked");
    const sealed = path.join(dir, "sealed");
    failReaddir([locked, sealed], eacces());
    const result = await call(client, "search_files", {
      path: dir,
      pattern: "**/*hidden*",
    });
    expect(result.isError).toBeFalsy();
    const [matches, note] = textOf(result).split("\n\n");
    expect(matches).toBe("No matches found");
    const [heading, ...listed] = note.split("\n");
    expect(heading).toBe(
      "The search is incomplete: 2 directories could not be read, and any matches inside are missing:",
    );
    expect(listed.sort()).toEqual([`${locked} (EACCES)`, `${sealed} (EACCES)`]);
  });

  it("names the directory without a code when the error carries none", async () => {
    const locked = path.join(dir, "locked");
    failReaddir([locked], new Error("unreadable"));
    const result = await call(client, "search_files", {
      path: dir,
      pattern: "**/a.txt",
    });
    expect(textOf(result)).toBe(
      `${path.join(dir, "open", "a.txt")}\n\n` +
        "The search is incomplete: 1 directory could not be read, and any matches inside are missing:\n" +
        locked,
    );
  });

  it("still fails the request when the starting directory cannot be read", async () => {
    failReaddir([dir], eacces());
    const result = await call(client, "search_files", {
      path: dir,
      pattern: "**/*.txt",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("EACCES");
  });

  it("reports nothing extra when every directory reads", async () => {
    const result = await call(client, "search_files", {
      path: dir,
      pattern: "**/a.txt",
    });
    expect(textOf(result)).toBe(path.join(dir, "open", "a.txt"));
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports a real chmod 000 directory",
    async () => {
      const locked = path.join(dir, "locked");
      await fs.chmod(locked, 0o000);
      const result = await call(client, "search_files", {
        path: dir,
        pattern: "**/*.txt",
      });
      expect(result.isError).toBeFalsy();
      expect(textOf(result)).toContain(`\n${locked} (EACCES)`);
      expect(textOf(result)).toContain(path.join(dir, "open", "a.txt"));
    },
  );
});

describe("searchFilesWithValidation without an onUnreadable callback", () => {
  it("skips the unreadable directory and returns the rest", async () => {
    const locked = path.join(dir, "locked");
    failReaddir([locked], eacces());
    const realDir = await fs.realpath(dir);
    const results = await searchFilesWithValidation(realDir, "**/a.txt", [
      realDir,
    ]);
    expect(results).toEqual([path.join(realDir, "open", "a.txt")]);
  });
});
