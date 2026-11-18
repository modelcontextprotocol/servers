// Protocol-level tests that every directory listing is anchored to the
// directory validation resolved, as every read and write is
// (pinned-directory.ts). The swap an attacker would race is staged
// deterministically, as read-anchored.test.ts stages it: right after
// validation realpath's a directory the tool is about to list, that directory
// is swapped for a symlink to a directory outside the allowed one. Each
// listing must then refuse rather than return the outside directory's entry
// names. Before listings were anchored, each of these returned them.

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

// The name is what a listing would leak, so it is the marker.
const OUTSIDE_NAME = "OUTSIDE-NAME-CANARY.txt";
const INSIDE_NAME = "inside-marker.txt";

let dir: string;
let outside: string;
let flip: string;
let flipReal: string;
let conn: Connected;
let client: Client;

beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-list-anchor-");
  outside = await makeTempDir("mcp-fs-list-anchor-outside-");
  flip = path.join(dir, "flip");
  flipReal = path.join(dir, "flip-real");
  await fs.mkdir(flip);
  await fs.writeFile(path.join(flip, INSIDE_NAME), "inside");
  await fs.writeFile(path.join(outside, OUTSIDE_NAME), "outside");
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

/** Swap `flip` for a symlink to `outside`, once, right after it is realpath'd. */
function swapAfterRealpath(): void {
  const realRealpath = fs.realpath.bind(fs);
  let swapped = false;
  vi.spyOn(fs, "realpath").mockImplementation(async (p, opts) => {
    const resolved = await realRealpath(p, opts);
    if (!swapped && p === flip) {
      swapped = true;
      fsSync.renameSync(flip, flipReal);
      fsSync.symlinkSync(outside, flip);
    }
    return resolved;
  });
}

const DIRECTORY_CHANGED =
  /Access denied - a directory on the path changed during the operation/;

describe.skipIf(process.platform === "win32")(
  "a listed directory swapped for a symlink after validation",
  () => {
    it.each([
      ["list_directory", {}],
      ["list_directory_with_sizes", {}],
      ["directory_tree", {}],
      ["search_files", { pattern: "**" }],
    ])("%s does not list through it", async (tool, extra) => {
      swapAfterRealpath();
      const result = await call(client, tool, { path: flip, ...extra });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(DIRECTORY_CHANGED);
      expect(JSON.stringify(result)).not.toContain(OUTSIDE_NAME);
    });

    it("directory_tree does not list a subdirectory through it", async () => {
      swapAfterRealpath();
      const result = await call(client, "directory_tree", { path: dir });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(DIRECTORY_CHANGED);
      expect(JSON.stringify(result)).not.toContain(OUTSIDE_NAME);
    });

    it("search_files does not search a subdirectory through it, and says so", async () => {
      swapAfterRealpath();
      const result = await call(client, "search_files", {
        path: dir,
        pattern: "**",
      });
      expect(result.isError).toBeFalsy();
      expect(JSON.stringify(result)).not.toContain(OUTSIDE_NAME);
      // The swapped directory is reported as unreadable, not as empty.
      expect(textOf(result)).toContain(`${flip}`);
      expect(textOf(result)).toMatch(/could not be read/i);
    });
  },
);

describe("listings that are not swapped", () => {
  it("list every tool's way, from the directory validation resolved", async () => {
    expect(textOf(await call(client, "list_directory", { path: flip }))).toBe(
      `[FILE] ${INSIDE_NAME}`,
    );
    expect(
      textOf(await call(client, "list_directory_with_sizes", { path: flip })),
    ).toContain(`[FILE] ${INSIDE_NAME}`);
    expect(
      JSON.parse(textOf(await call(client, "directory_tree", { path: dir }))),
    ).toEqual([
      {
        name: "flip",
        type: "directory",
        children: [{ name: INSIDE_NAME, type: "file" }],
      },
    ]);
    expect(
      textOf(
        await call(client, "search_files", { path: dir, pattern: "**/*.txt" }),
      ),
    ).toBe(path.join(flip, INSIDE_NAME));
  });

  it("refuses a static symlink to a directory outside, as before", async () => {
    const link = path.join(dir, "link");
    await fs.symlink(outside, link);
    for (const tool of ["list_directory", "directory_tree"]) {
      const result = await call(client, tool, { path: link });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain(OUTSIDE_NAME);
    }
  });
});
