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
    await fs.writeFile(path.join(testDir1, "common.txt"), "common");
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

  it("detects files with different content by size", async () => {
    await fs.writeFile(path.join(testDir1, "diff.txt"), "content1");
    await fs.writeFile(path.join(testDir2, "diff.txt"), "different content");

    const result = await compareDirectories(testDir1, testDir2);

    expect(result.differentContent).toHaveLength(1);
    expect(result.differentContent[0].path).toBe("diff.txt");
    expect(result.differentContent[0].dir1Size).not.toBe(result.differentContent[0].dir2Size);
  });

  it("identifies identical files by size and mtime", async () => {
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

    expect(result.identical).toContain("subdir/nested.txt");
  });

  describe("compareContent=true", () => {
    it("detects different content with same size", async () => {
      // Same size but different content
      await fs.writeFile(path.join(testDir1, "same-size.txt"), "aaa");
      await fs.writeFile(path.join(testDir2, "same-size.txt"), "bbb");

      const result = await compareDirectories(testDir1, testDir2, true);

      expect(result.differentContent).toHaveLength(1);
      expect(result.differentContent[0].path).toBe("same-size.txt");
      expect(result.identical).toHaveLength(0);
    });

    it("identifies same content despite different mtime", async () => {
      // Write same content to both files
      await fs.writeFile(path.join(testDir1, "same-content.txt"), "same data");
      await fs.writeFile(path.join(testDir2, "same-content.txt"), "same data");
      
      // Wait and touch one file to change its mtime (re-write same content)
      await new Promise(resolve => setTimeout(resolve, 100));
      await fs.writeFile(path.join(testDir1, "same-content.txt"), "same data");

      const result = await compareDirectories(testDir1, testDir2, true);

      // With compareContent=true, content is what matters, not mtime
      expect(result.identical).toContain("same-content.txt");
      expect(result.differentContent).toHaveLength(0);
    });

    it("detects different content when sizes match", async () => {
      // Create files with same size but different content
      await fs.writeFile(path.join(testDir1, "binary.bin"), Buffer.from([0x01, 0x02, 0x03]));
      await fs.writeFile(path.join(testDir2, "binary.bin"), Buffer.from([0x04, 0x05, 0x06]));

      const result = await compareDirectories(testDir1, testDir2, true);

      expect(result.differentContent).toHaveLength(1);
      expect(result.differentContent[0].path).toBe("binary.bin");
      expect(result.identical).toHaveLength(0);
    });

    it("identifies identical binary content", async () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]);
      await fs.writeFile(path.join(testDir1, "identical.bin"), binaryData);
      await fs.writeFile(path.join(testDir2, "identical.bin"), binaryData);

      const result = await compareDirectories(testDir1, testDir2, true);

      expect(result.identical).toContain("identical.bin");
      expect(result.differentContent).toHaveLength(0);
    });
  });

  describe("compareContent=false (default)", () => {
    it("marks files with different mtime as different", async () => {
      await fs.writeFile(path.join(testDir1, "diff-mtime.txt"), "same");
      await fs.writeFile(path.join(testDir2, "diff-mtime.txt"), "same");
      
      // Wait and touch the file in dir1 to change its mtime (re-write same content)
      await new Promise(resolve => setTimeout(resolve, 100));
      await fs.writeFile(path.join(testDir1, "diff-mtime.txt"), "same");

      const result = await compareDirectories(testDir1, testDir2, false);

      // With compareContent=false, different mtime means different files
      expect(result.differentContent).toHaveLength(1);
      expect(result.differentContent[0].path).toBe("diff-mtime.txt");
      expect(result.identical).toHaveLength(0);
    });
  });
});
