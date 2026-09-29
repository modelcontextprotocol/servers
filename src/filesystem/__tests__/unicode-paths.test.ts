import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setAllowedDirectories, validatePath } from "../lib.js";

/** True when this file system stores "café" composed and decomposed as two entries. */
async function holdsBothNormalizationForms(): Promise<boolean> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-unicode-probe-"));
  try {
    await fs.mkdir(path.join(dir, "caf\u00e9"));
    await fs.mkdir(path.join(dir, "cafe\u0301"));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const distinctForms = await holdsBothNormalizationForms();

describe("Unicode-equivalent filesystem paths", () => {
  let testDirectory: string;

  beforeEach(async () => {
    // Realpath the temp directory: on macOS os.tmpdir() is under /var, a
    // symlink to /private/var, and validatePath compares realpaths.
    testDirectory = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "mcp-unicode-paths-")),
    );
    setAllowedDirectories([testDirectory]);
  });

  afterEach(async () => {
    setAllowedDirectories([]);
    await fs.rm(testDirectory, { recursive: true, force: true });
  });

  it("resolves an existing decomposed path from a composed request", async () => {
    const onDiskDirectory = "de\u0301marche";
    const onDiskFile = "re\u0301sume\u0301.txt";
    await fs.mkdir(path.join(testDirectory, onDiskDirectory));
    await fs.writeFile(
      path.join(testDirectory, onDiskDirectory, onDiskFile),
      "content",
    );

    const resolved = await validatePath(
      path.join(testDirectory, "d\u00e9marche", "r\u00e9sum\u00e9.txt"),
    );

    expect(resolved).toBe(
      await fs.realpath(path.join(testDirectory, onDiskDirectory, onDiskFile)),
    );
  });

  it("preserves a new basename after resolving a Unicode-equivalent parent", async () => {
    const onDiskDirectory = "de\u0301marche";
    await fs.mkdir(path.join(testDirectory, onDiskDirectory));

    const resolved = await validatePath(
      path.join(testDirectory, "d\u00e9marche", "new.txt"),
    );

    expect(resolved).toBe(
      path.join(
        await fs.realpath(path.join(testDirectory, onDiskDirectory)),
        "new.txt",
      ),
    );
  });

  // Normalization-insensitive file systems (APFS, HFS+) treat both spellings as
  // one name, so the ambiguous state this test asserts on cannot be created.
  it.skipIf(!distinctForms)(
    "rejects ambiguous canonically equivalent entries",
    async () => {
      const composed = "caf\u00e9";
      const decomposed = "cafe\u0301";
      await fs.mkdir(path.join(testDirectory, composed));
      await fs.mkdir(path.join(testDirectory, decomposed));

      await expect(
        validatePath(path.join(testDirectory, "cafe\u0341", "file.txt")),
      ).rejects.toThrow("Ambiguous Unicode path component");
    },
  );
});
