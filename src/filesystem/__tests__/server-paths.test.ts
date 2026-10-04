// Path validation as a client sees it (#4854): traversal, symlinks, relative
// and home paths, missing ancestors and Unicode normalization, each driven
// through a tool call over the in-memory transport. Absorbs the former
// nested-parents.test.ts (#4629) and unicode-paths.test.ts, which called
// validatePath directly. A test that pins a known bug cites its issue.

import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  call,
  connect,
  makeTempDir,
  quietStderr,
  textOf,
  type Connected,
} from "./helpers.js";

/** True when this file system stores "café" composed and decomposed as two entries. */
async function holdsBothNormalizationForms(): Promise<boolean> {
  const probe = await makeTempDir("mcp-unicode-probe-");
  try {
    await fs.mkdir(path.join(probe, "caf\u00e9"));
    await fs.mkdir(path.join(probe, "cafe\u0301"));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    await fs.rm(probe, { recursive: true, force: true });
  }
}

const distinctForms = await holdsBothNormalizationForms();

let dir: string;
let outside: string;
let conn: Connected;
let client: Client;

async function read(p: string) {
  return call(client, "read_text_file", { path: p });
}

beforeEach(async () => {
  quietStderr();
  dir = await makeTempDir("mcp-fs-paths-");
  outside = await makeTempDir("mcp-fs-outside-");
  await fs.writeFile(path.join(outside, "secret.txt"), "secret");
  conn = await connect([dir]);
  client = conn.client;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await conn.close();
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

describe("the allow-list boundary", () => {
  it("refuses an absolute path outside, naming the allowed directories", async () => {
    const target = path.join(outside, "secret.txt");
    const result = await read(target);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `Access denied - path outside allowed directories: ${target} not in ${dir}`,
    );
  });

  it("refuses .. traversal out of the allowed directory", async () => {
    const result = await read(
      path.join(dir, "..", path.basename(outside), "secret.txt"),
    );
    expect(textOf(result)).toMatch(/^Access denied - path outside/);
  });

  it("refuses a sibling that merely shares the allowed directory's prefix", async () => {
    const sibling = `${dir}-evil`;
    await fs.mkdir(sibling);
    try {
      await fs.writeFile(path.join(sibling, "f"), "x");
      const result = await read(path.join(sibling, "f"));
      expect(textOf(result)).toMatch(/^Access denied - path outside/);
    } finally {
      await fs.rm(sibling, { recursive: true, force: true });
    }
  });

  it("allows the allowed directory itself", async () => {
    const result = await call(client, "list_directory", { path: dir });
    expect(result.isError).toBeFalsy();
  });

  it("refuses a path containing a NUL byte", async () => {
    const result = await read(`${dir}/a\u0000b`);
    expect(textOf(result)).toMatch(/^Access denied - path outside/);
  });

  it("refuses a ~ path outside the allowed directories, after expanding it", async () => {
    const result = await read("~/x.txt");
    expect(textOf(result)).toBe(
      `Access denied - path outside allowed directories: ${path.join(os.homedir(), "x.txt")} not in ${dir}`,
    );
  });

  it.skipIf(process.platform === "win32")(
    "refuses a Windows drive path on a POSIX host rather than writing a literal file",
    async () => {
      const result = await call(client, "write_file", {
        path: "C:\\Users\\me\\notes.md",
        content: "x",
      });
      expect(textOf(result)).toBe(
        "Access denied - Windows-style path received on a POSIX host: C:\\Users\\me\\notes.md",
      );
      expect(await fs.readdir(dir)).toEqual([]);
    },
  );
});

describe("relative paths", () => {
  it("resolves against the first allowed directory, not the process cwd", async () => {
    await fs.writeFile(path.join(dir, "rel.txt"), "relative");
    const result = await read("rel.txt");
    expect(textOf(result)).toBe("relative");
  });

  it("resolves against a later allowed directory when the first would escape", async () => {
    const second = await makeTempDir("mcp-fs-second-");
    const multi = await connect([dir, second]);
    try {
      await fs.mkdir(path.join(second, "inner"));
      await fs.writeFile(path.join(second, "inner", "f.txt"), "second");
      const relative = path.join("..", path.basename(second), "inner", "f.txt");
      const result = await call(multi.client, "read_text_file", {
        path: relative,
      });
      expect(textOf(result)).toBe("second");
    } finally {
      await multi.close();
      await fs.rm(second, { recursive: true, force: true });
    }
  });

  it("falls back to the first allowed directory and refuses an escaping relative path", async () => {
    const result = await read("../escape.txt");
    expect(textOf(result)).toBe(
      `Access denied - path outside allowed directories: ${path.resolve(dir, "../escape.txt")} not in ${dir}`,
    );
  });

  it("resolves against the process cwd when there are no allowed directories, and refuses it", async () => {
    // A Roots client that offers no roots: with no directories and no Roots
    // at all the server closes the connection instead (#4992).
    const empty = await connect([], {
      capabilities: { roots: {} },
      listRoots: () => [],
    });
    try {
      const result = await call(empty.client, "read_text_file", {
        path: "anything.txt",
      });
      expect(textOf(result)).toBe(
        `Access denied - path outside allowed directories: ${path.resolve(process.cwd(), "anything.txt")} not in `,
      );
    } finally {
      await empty.close();
    }
  });
});

describe("symlinks", () => {
  it("follows a symlink that stays inside", async () => {
    await fs.writeFile(path.join(dir, "real.txt"), "real");
    await fs.symlink(path.join(dir, "real.txt"), path.join(dir, "alias.txt"));
    expect(textOf(await read(path.join(dir, "alias.txt")))).toBe("real");
  });

  it("refuses a symlink whose target is outside", async () => {
    const link = path.join(dir, "escape.txt");
    await fs.symlink(path.join(outside, "secret.txt"), link);
    const result = await read(link);
    expect(textOf(result)).toBe(
      `Access denied - symlink target outside allowed directories: ${path.join(outside, "secret.txt")} not in ${dir}`,
    );
  });

  it("refuses a new path under a symlinked directory that leaves (#4629)", async () => {
    await fs.symlink(outside, path.join(dir, "link"), "junction");
    const result = await call(client, "create_directory", {
      path: path.join(dir, "link", "a", "b"),
    });
    expect(textOf(result)).toBe(
      `Access denied - symlink target outside allowed directories: ${outside} not in ${dir}`,
    );
    expect(await fs.readdir(outside)).toEqual(["secret.txt"]);
  });

  it("refuses to write through a dangling symlink, reporting a missing parent", async () => {
    const link = path.join(dir, "dangling");
    await fs.symlink(path.join(outside, "not-yet"), link);
    const result = await call(client, "write_file", {
      path: link,
      content: "x",
    });
    expect(textOf(result)).toBe(`Parent directory does not exist: ${dir}`);
    await expect(fs.stat(path.join(outside, "not-yet"))).rejects.toThrow();
  });

  it("reports a realpath failure other than ENOENT as is", async () => {
    await fs.writeFile(path.join(dir, "file.txt"), "");
    const result = await read(path.join(dir, "file.txt", "child"));
    expect(textOf(result)).toMatch(/^ENOTDIR: not a directory, realpath/);
  });
});

describe("missing ancestors", () => {
  it("accepts a path several levels below the last existing directory (#4629)", async () => {
    const target = path.join(dir, "a", "b", "c");
    const result = await call(client, "create_directory", { path: target });
    expect(result.isError).toBeFalsy();
  });

  it('reports "Parent directory does not exist" when the allowed directory itself is gone', async () => {
    await fs.rm(dir, { recursive: true, force: true });
    const result = await call(client, "write_file", {
      path: path.join(dir, "f.txt"),
      content: "x",
    });
    expect(textOf(result)).toBe(`Parent directory does not exist: ${dir}`);
  });
});

describe("Unicode normalization", () => {
  it("resolves a composed (NFC) request to the decomposed (NFD) names on disk", async () => {
    const onDiskDir = "de\u0301marche";
    const onDiskFile = "re\u0301sume\u0301.txt";
    await fs.mkdir(path.join(dir, onDiskDir));
    await fs.writeFile(path.join(dir, onDiskDir, onDiskFile), "content");
    const result = await read(
      path.join(dir, "d\u00e9marche", "r\u00e9sum\u00e9.txt"),
    );
    expect(textOf(result)).toBe("content");
  });

  it("keeps a new basename when the parent resolves through Unicode equivalence", async () => {
    await fs.mkdir(path.join(dir, "de\u0301marche"));
    await call(client, "write_file", {
      path: path.join(dir, "d\u00e9marche", "new.txt"),
      content: "x",
    });
    expect(
      await fs.readFile(path.join(dir, "de\u0301marche", "new.txt"), "utf-8"),
    ).toBe("x");
  });

  // Normalization-insensitive file systems (APFS, HFS+) treat both spellings
  // as one name, so the ambiguous state cannot be created there.
  it.skipIf(!distinctForms)(
    "refuses a component that matches two canonically equivalent entries",
    async () => {
      await fs.mkdir(path.join(dir, "caf\u00e9"));
      await fs.mkdir(path.join(dir, "cafe\u0301"));
      const result = await call(client, "write_file", {
        path: path.join(dir, "cafe\u0341", "file.txt"),
        content: "x",
      });
      expect(textOf(result)).toBe(
        "Ambiguous Unicode path component: cafe\u0341",
      );
    },
  );

  // KNOWN BUG #1970: pins current (wrong) behavior; the fix changes this assertion.
  // #1970: when the allowed directory's own name is NFD, an NFC spelling of
  // it fails the allow-list prefix check (a string comparison) before the
  // Unicode walk starts, on any file system.
  it("refuses an NFC spelling of an NFD allowed directory (#1970)", async () => {
    const nfdRoot = path.join(dir, "Capture d\u2019e\u0301cran");
    await fs.mkdir(nfdRoot);
    await fs.writeFile(path.join(nfdRoot, "shot.png"), "png");
    const scoped = await connect([nfdRoot]);
    try {
      const requested = path.join(dir, "Capture d\u2019\u00e9cran", "shot.png");
      const result = await call(scoped.client, "read_text_file", {
        path: requested,
      });
      expect(textOf(result)).toBe(
        `Access denied - path outside allowed directories: ${requested} not in ${nfdRoot}`,
      );
    } finally {
      await scoped.close();
    }
  });
});
