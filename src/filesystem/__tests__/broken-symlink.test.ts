import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validatePath } from "../lib.js";

describe("a symlink with no target", () => {
  let testDirectory: string;
  let allowedDirs: string[];

  beforeEach(async () => {
    testDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "mcp-broken-symlink-"),
    );
    allowedDirs = [testDirectory];
  });

  afterEach(async () => {
    await fs.rm(testDirectory, { recursive: true, force: true });
  });

  it("is named as such, not as a missing parent directory", async () => {
    const link = path.join(testDirectory, "link.txt");
    await fs.symlink(path.join(testDirectory, "gone.txt"), link);

    await expect(validatePath(link, allowedDirs)).rejects.toThrow(
      /Broken symlink/,
    );
    // the parent is right there, so the old message pointed at the wrong thing
    await expect(fs.stat(testDirectory)).resolves.toBeDefined();
  });

  // Windows needs a privilege to create a symlink at all, and a self-referencing
  // one is not reachable there the same way.
  it.skipIf(process.platform === "win32")(
    "leaves a realpath failure other than ENOENT alone",
    async () => {
      const loop = path.join(testDirectory, "loop");
      await fs.symlink(loop, loop);

      // A cycle fails realpath with ELOOP, not ENOENT, so validatePath throws
      // before the equivalent-path walk runs at all. The guard is against a
      // broader catch there that would rename every realpath failure.
      await expect(validatePath(loop, allowedDirs)).rejects.toThrow(/^ELOOP/);
    },
  );

  it("does not change what a genuinely missing path reports", async () => {
    const missing = path.join(testDirectory, "nope", "file.txt");

    // resolveUnicodeEquivalentPath returns the tail so create_directory can
    // mkdir -p it; that is unrelated to the broken-symlink case.
    await expect(validatePath(missing, allowedDirs)).resolves.toBe(
      path.join(await fs.realpath(testDirectory), "nope", "file.txt"),
    );
  });
});
