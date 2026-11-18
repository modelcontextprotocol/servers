// The Windows listing check (#5600): readDirectoryInPlace cannot anchor a
// listing on Windows (the working directory is a path string there), so it
// checks the listed directory before and after the read: the path must
// resolve to itself, with no junction or symlink on it, and must name the
// same directory both times (pinned-directory.ts).
//
// These tests run that branch on every host. On Windows (the CI Windows leg)
// it runs for real, against real junctions. Elsewhere process.platform is
// set to "win32", which is all the branch reads; the filesystem stays the
// host's, so the swaps are real there too, and the coverage gate (which runs
// on Linux) sees the branch.
//
// A swap staged from inside the read can be refused by the host: Windows will
// not rename a directory a process is in, and the server is in the listed
// directory. So those tests assert what must hold either way: the entries
// returned are never the outside directory's, and a swap that did happen is
// refused. The protocol-level tests of a swap staged before the listing are
// in list-anchored.test.ts, and run on Windows too.

import fsSync from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDirectoryInPlace } from "../pinned-directory.js";
import { makeTempDir } from "./helpers.js";

const OUTSIDE_NAME = "OUTSIDE-NAME-CANARY.txt";
const INSIDE_NAME = "inside-marker.txt";
const DIRECTORY_CHANGED =
  /Access denied - a directory on the path changed during the operation/;

const realPlatform = process.platform;

let dir: string;
let outside: string;
let middle: string;
let listed: string;

beforeEach(async () => {
  dir = await makeTempDir("mcp-fs-list-win-");
  outside = await makeTempDir("mcp-fs-list-win-outside-");
  middle = path.join(dir, "middle");
  listed = path.join(middle, "listed");
  fsSync.mkdirSync(listed, { recursive: true });
  fsSync.writeFileSync(path.join(listed, INSIDE_NAME), "inside");
  // The outside tree mirrors the inside one, so a swapped parent still leads
  // to a real directory named "listed".
  fsSync.mkdirSync(path.join(outside, "listed"));
  fsSync.writeFileSync(path.join(outside, OUTSIDE_NAME), "outside");
  fsSync.writeFileSync(path.join(outside, "listed", OUTSIDE_NAME), "outside");
  Object.defineProperty(process, "platform", { value: "win32" });
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process, "platform", { value: realPlatform });
  fsSync.rmSync(dir, { recursive: true, force: true });
  fsSync.rmSync(outside, { recursive: true, force: true });
});

/** A junction on Windows, which needs no privilege; a symlink elsewhere. */
function link(target: string, at: string): void {
  fsSync.symlinkSync(target, at, "junction");
}

/** Run `swap` on the first readdirSync, before the real read; say if it ran. */
function swapDuringRead(swap: () => void): { swapped: () => boolean } {
  const realReaddirSync = fsSync.readdirSync.bind(fsSync) as (
    target: fsSync.PathLike,
    options: { withFileTypes: true },
  ) => fsSync.Dirent[];
  let attempted = false;
  let swapped = false;
  vi.spyOn(fsSync, "readdirSync").mockImplementation(((
    target: fsSync.PathLike,
    options: { withFileTypes: true },
  ) => {
    if (!attempted) {
      attempted = true;
      try {
        swap();
        swapped = true;
      } catch {
        // The host refused the swap (see the header); nothing changed.
      }
    }
    return realReaddirSync(target, options);
  }) as typeof fsSync.readdirSync);
  return { swapped: () => swapped };
}

/** List `listed`; the names it returned, or the refusal it threw. */
function listNames(): { names?: string[]; refusal?: string } {
  try {
    return { names: readDirectoryInPlace(listed).map((entry) => entry.name) };
  } catch (error) {
    return { refusal: (error as Error).message };
  }
}

describe("the Windows listing check", () => {
  it("lists a directory nothing was swapped on, naming it as the parent", () => {
    const entries = readDirectoryInPlace(listed);
    expect(entries.map((entry) => entry.name)).toEqual([INSIDE_NAME]);
    expect(entries[0].parentPath).toBe(listed);
    expect(entries[0].isFile()).toBe(true);
  });

  it("refuses a directory that is now a link to one outside", () => {
    fsSync.renameSync(listed, path.join(middle, "listed-real"));
    link(outside, listed);
    const { names, refusal } = listNames();
    expect(names).toBeUndefined();
    expect(refusal).toMatch(DIRECTORY_CHANGED);
  });

  it("refuses a directory whose parent is now a link to one outside", () => {
    // The last component is a real directory, the outside tree's "listed", so
    // only the path's real location shows the swap.
    fsSync.renameSync(middle, path.join(dir, "middle-real"));
    link(outside, middle);
    const { names, refusal } = listNames();
    expect(names).toBeUndefined();
    expect(refusal).toMatch(DIRECTORY_CHANGED);
  });

  it("never returns the outside entries when the directory is swapped for a link during the read", () => {
    const { swapped } = swapDuringRead(() => {
      fsSync.renameSync(listed, path.join(middle, "listed-real"));
      link(outside, listed);
    });
    const { names, refusal } = listNames();
    expect(names ?? []).not.toContain(OUTSIDE_NAME);
    if (swapped()) {
      expect(refusal).toMatch(DIRECTORY_CHANGED);
    } else {
      expect(names).toEqual([INSIDE_NAME]);
    }
  });

  it("never returns the outside entries when a parent is swapped for a link during the read", () => {
    const { swapped } = swapDuringRead(() => {
      fsSync.renameSync(middle, path.join(dir, "middle-real"));
      link(outside, middle);
    });
    const { names, refusal } = listNames();
    expect(names ?? []).not.toContain(OUTSIDE_NAME);
    if (swapped()) {
      expect(refusal).toMatch(DIRECTORY_CHANGED);
    } else {
      expect(names).toEqual([INSIDE_NAME]);
    }
  });

  it("refuses when another directory takes the name during the read", () => {
    // No link anywhere, so only the identity shows it is not the directory
    // the first check saw.
    const { swapped } = swapDuringRead(() => {
      fsSync.renameSync(listed, path.join(middle, "listed-real"));
      fsSync.mkdirSync(listed);
    });
    const { names, refusal } = listNames();
    if (swapped()) {
      expect(refusal).toMatch(DIRECTORY_CHANGED);
    } else {
      expect(names).toEqual([INSIDE_NAME]);
    }
  });

  it.skipIf(realPlatform === "win32")(
    "is not applied off Windows, where the listing is anchored",
    () => {
      Object.defineProperty(process, "platform", { value: realPlatform });
      const lstat = vi.spyOn(fsSync, "lstatSync");
      expect(readDirectoryInPlace(listed).map((entry) => entry.name)).toEqual([
        INSIDE_NAME,
      ]);
      expect(lstat).not.toHaveBeenCalled();
    },
  );
});
