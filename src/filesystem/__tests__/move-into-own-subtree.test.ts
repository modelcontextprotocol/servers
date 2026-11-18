// Moving a directory into itself is refused for what it is (#5555). The
// same-device move first renames its source to a staging name, which carries
// the destination's directory away with it when that directory is inside the
// source, so the move went on to report "Parent directory does not exist" for
// a directory that did exist. The refusal now comes before anything is
// renamed, with EINVAL and a message naming both paths. The protocol-level
// tests drive move_file through a client; the unit tests below them call
// renameIntoDirectory directly, for the spellings validatePath would have
// resolved away and for the moves that must still go through.

import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/client";
import { renameIntoDirectory } from "../pinned-directory.js";
import {
  call,
  connect,
  makeTempDir,
  quietStderr,
  textOf,
  type Connected,
} from "./helpers.js";

const symlinks = process.platform !== "win32";

let dir: string;
let cwd: string;
let conn: Connected;
let client: Client;

beforeEach(async () => {
  quietStderr();
  cwd = process.cwd();
  dir = await makeTempDir("mcp-fs-move-into-self-");
  fs.mkdirSync(path.join(dir, "sub", "inner"), { recursive: true });
  fs.writeFileSync(path.join(dir, "sub", "x.txt"), "x");
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.chdir(cwd);
  await conn.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Every name under `directory`, relative to it, sorted. */
function tree(directory: string): string[] {
  return fs
    .readdirSync(directory, { recursive: true, encoding: "utf-8" })
    .map((name) => name.split(path.sep).join("/"))
    .sort();
}

/** The source is where it was, and no staging name was left behind. */
function expectUntouched(): void {
  expect(tree(dir)).toEqual(["sub", "sub/inner", "sub/x.txt"]);
  expect(fs.readFileSync(path.join(dir, "sub", "x.txt"), "utf-8")).toBe("x");
  expect(process.cwd()).toBe(cwd);
}

function refusal(source: string, destination: string): string {
  return `Cannot move a directory into itself: ${destination} is inside ${source}`;
}

/** What renameIntoDirectory throws for this move. */
function errorOf(source: string, destination: string): NodeJS.ErrnoException {
  try {
    renameIntoDirectory(source, destination);
  } catch (error) {
    return error as NodeJS.ErrnoException;
  }
  throw new Error("expected renameIntoDirectory to throw");
}

describe("move_file of a directory into itself (#5555)", () => {
  it("refuses a destination below the source, naming the real reason", async () => {
    const source = path.join(dir, "sub");
    const destination = path.join(dir, "sub", "inner", "sub");
    const result = await call(client, "move_file", { source, destination });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(refusal(source, destination));
    expect(textOf(result)).not.toContain("Parent directory does not exist");
    expectUntouched();
  });

  it("refuses a destination directly inside the source", async () => {
    const source = path.join(dir, "sub");
    const destination = path.join(dir, "sub", "new");
    const result = await call(client, "move_file", { source, destination });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(refusal(source, destination));
    expectUntouched();
  });

  it("refuses a source given with a trailing separator", async () => {
    const source = path.join(dir, "sub");
    const destination = path.join(dir, "sub", "inner", "sub");
    const result = await call(client, "move_file", {
      source: source + path.sep,
      destination,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(refusal(source, destination));
    expectUntouched();
  });

  it("still reports a destination directory that really is missing", async () => {
    const missing = path.join(dir, "nope");
    const result = await call(client, "move_file", {
      source: path.join(dir, "sub"),
      destination: path.join(missing, "sub"),
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Parent directory does not exist: ${missing}`);
    expectUntouched();
  });

  it("still moves a directory beside itself, under a name that extends its own", async () => {
    const result = await call(client, "move_file", {
      source: path.join(dir, "sub"),
      destination: path.join(dir, "sub2"),
    });
    expect(result.isError).toBeFalsy();
    expect(tree(dir)).toEqual(["sub2", "sub2/inner", "sub2/x.txt"]);
  });

  it("still moves a directory out of its own subtree, into its parent", async () => {
    const result = await call(client, "move_file", {
      source: path.join(dir, "sub", "inner"),
      destination: path.join(dir, "inner"),
    });
    expect(result.isError).toBeFalsy();
    expect(tree(dir)).toEqual(["inner", "sub", "sub/x.txt"]);
  });

  it("still moves a file into a directory beside it", async () => {
    const result = await call(client, "move_file", {
      source: path.join(dir, "sub", "x.txt"),
      destination: path.join(dir, "sub", "inner", "x.txt"),
    });
    expect(result.isError).toBeFalsy();
    expect(tree(dir)).toEqual(["sub", "sub/inner", "sub/inner/x.txt"]);
  });
});

describe("renameIntoDirectory, for a directory moved into itself (#5555)", () => {
  it("fails with EINVAL before anything is renamed", () => {
    const source = path.join(dir, "sub");
    const destination = path.join(dir, "sub", "inner", "sub");
    const rename = vi.spyOn(fs, "renameSync");
    const error = errorOf(source, destination);
    expect(error.code).toBe("EINVAL");
    expect(error.message).toBe(refusal(source, destination));
    expect(rename).not.toHaveBeenCalled();
    expectUntouched();
  });

  it("refuses a destination directory that does not exist below the source", () => {
    const source = path.join(dir, "sub");
    const destination = path.join(dir, "sub", "nope", "sub");
    const error = errorOf(source, destination);
    expect(error.code).toBe("EINVAL");
    expect(error.message).toBe(refusal(source, destination));
    expectUntouched();
  });

  // The directory is compared by identity, so a spelling of it that a string
  // comparison would take for another directory is still the source.
  it("refuses another case of the source on a case-insensitive volume", (context) => {
    if (!fs.existsSync(path.join(dir, "SUB"))) {
      context.skip();
    }
    const source = path.join(dir, "sub");
    const destination = path.join(dir, "SUB", "inner", "sub");
    const error = errorOf(source, destination);
    expect(error.code).toBe("EINVAL");
    expect(error.message).toBe(refusal(source, destination));
    expectUntouched();
  });

  // A symlink to a directory is not that directory: moving the link moves
  // only the link, so its target's subtree is a fine place for it.
  it.skipIf(!symlinks)(
    "moves a symlink to a directory into that directory",
    () => {
      fs.symlinkSync(path.join(dir, "sub"), path.join(dir, "link"));
      renameIntoDirectory(
        path.join(dir, "link"),
        path.join(dir, "sub", "inner", "link"),
      );
      expect(
        fs.lstatSync(path.join(dir, "sub", "inner", "link")).isSymbolicLink(),
      ).toBe(true);
      expect(fs.existsSync(path.join(dir, "link"))).toBe(false);
      expect(fs.existsSync(path.join(dir, "sub", "x.txt"))).toBe(true);
    },
  );

  it("leaves a missing source to the rename, which names it", () => {
    const source = path.join(dir, "gone");
    const error = errorOf(source, path.join(dir, "sub", "gone"));
    expect(error.code).toBe("ENOENT");
    expect(error.message).toContain(source);
    expect(error.message).not.toContain("into itself");
    expectUntouched();
  });
});
