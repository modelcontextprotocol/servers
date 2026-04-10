import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { compareDirectories, setAllowedDirectories } from "../lib.js";

describe("compareDirectories", () => {
  const testDir1 = path.join(os.tmpdir(), "test-compare-1-" + Date.now());
  const testDir2 = path.join(os.tmpdir(), "test-compare-2-" + Date.now());

  beforeEach(async () => {
    await fs.mkdir(testDir1, { recursive: true });
    await fs.mkdir(testDir2, { recursive: true });
    // Set allowed directories for validation
    setAllowedDirectories([testDir1, testDir2]);
  });

  afterEach(async () => {
    await fs.rm(testDir1, { recursive: true, force: true });
    await fs.rm(testDir2, { recursive: true, force: true });
  });

  it("identifies files only in first directory", async () => {
    await fs.writeFile(path.join(testDir1, "only1.txt"), "content1");
    await fs.writeFile(path.join(testDir2, "common.txt"), "common");

    const result = await compareDirectories(testDir1, testDir2);

    expect(result.onlyInDir1).toContain("only1.txt");
    expect(result.onlyInDir1).not.toContain("common.txt");
    expect(result.identical).toContain("common.txt");
  });

  it("identifies files only in second directory", async () => {
    await fs.writeFile(path.join(testDir1, "common.txt"), "common");
    await fs.writeFile(path.join(testDir2, "only2.txt"), "content2");

    const result = await compareDirectories(testDir1, testDir2);

    expect(result.onlyInDir2).toContain("only2.txt");
    expect(result.onlyInDir2).not.toContain("common.txt");
  });

  it("detects files with different content", async () => {
    await fs.writeFile(path.join(testDir1, "diff.txt"), "content1");
    await fs.writeFile(path.join(testDir2, "diff.txt"), "different content");

    const result = await compareDirectories(testDir1, testDir2);

    expect(result.differentContent).toHaveLength(1);
    expect(result.differentContent[0].path).toBe("diff.txt");
    expect(result.differentContent[0].dir1Size).not.toBe(result.differentContent[0].dir2Size);
  });

  it("identifies identical files", async () => {
    await fs.writeFile(path.join(testDir1, "same.txt"), "identical content");
    await fs.writeFile(path.join(testDir2, "same.txt"), "identical content");

    const result = await compareDirectories(testDir1, testDir2);

    expect(result.identical).toContain("same.txt");
    expect(result.differentContent).toHaveLength(0);
  });

  it("handles empty directories", async () => {
    const result = await compareDirectories(testDir1, testDir2);

    expect(result.onlyInDir1).toHaveLength(0);
    expect(result.onlyInDir2).toHaveLength(0);
    expect(result.differentContent).toHaveLength(0);
    expect(result.identical).toHaveLength(0);
  });

  it("compares nested directory structures", async () => {
    await fs.mkdir(path.join(testDir1, "subdir"), { recursive: true });
    await fs.mkdir(path.join(testDir2, "subdir"), { recursive: true });
    await fs.writeFile(path.join(testDir1, "subdir", "nested.txt"), "nested");
    await fs.writeFile(path.join(testDir2, "subdir", "nested.txt"), "nested");

    const result = await compareDirectories(testDir1, testDir2);

    expect(result.identical).toContain(path.join("subdir", "nested.txt"));
  });
});
