// Unit tests for getValidRootDirectories, which turns the roots a client
// sends into allowed directories. The protocol-level roots behavior is in
// server-roots.test.ts; this file covers the inputs the SDK's Root schema
// keeps a client from sending over the wire (plain paths, ~) and failures
// that need a mocked stat. Root URIs are built with pathToFileURL, as a
// client builds them, not by concatenating "file://" and a path.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fsp } from "fs";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
} from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { getValidRootDirectories } from "../roots-utils.js";

describe("getValidRootDirectories", () => {
  let testDir1: string;
  let testDir2: string;
  let testDir3: string;
  let testFile: string;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // realpathSync.native, like the fs.promises.realpath the code uses,
    // expands a Windows 8.3 short name (RUNNER~1) in os.tmpdir(); the JS
    // realpathSync does not.
    testDir1 = realpathSync.native(
      mkdtempSync(join(tmpdir(), "mcp-roots-test1-")),
    );
    testDir2 = realpathSync.native(
      mkdtempSync(join(tmpdir(), "mcp-roots-test2-")),
    );
    testDir3 = realpathSync.native(
      mkdtempSync(join(tmpdir(), "mcp-roots-test3-")),
    );
    testFile = join(testDir1, "test-file.txt");
    writeFileSync(testFile, "test content");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(testDir1, { recursive: true, force: true });
    rmSync(testDir2, { recursive: true, force: true });
    rmSync(testDir3, { recursive: true, force: true });
  });

  describe("valid directory processing", () => {
    it("accepts file URIs and plain paths, with or without a name", async () => {
      const result = await getValidRootDirectories([
        { uri: pathToFileURL(testDir1).href, name: "File URI" },
        { uri: testDir2, name: "Plain path" },
        { uri: testDir3 },
      ]);
      expect(result).toEqual([testDir1, testDir2, testDir3]);
    });

    it("normalizes . and .. segments", async () => {
      const subDir = join(testDir1, "subdir");
      mkdirSync(subDir);
      const result = await getValidRootDirectories([
        { uri: `${pathToFileURL(testDir1).href}/./subdir/../subdir` },
      ]);
      expect(result).toEqual([subDir]);
    });

    it("expands ~ and ~/ in a plain path to the home directory", async () => {
      const home = realpathSync.native(homedir());
      expect(await getValidRootDirectories([{ uri: "~" }])).toEqual([home]);
      expect(await getValidRootDirectories([{ uri: "~/" }])).toEqual([home]);
    });
  });

  describe("error handling", () => {
    it("drops missing, non-directory and malformed roots, logging each", async () => {
      const nonExistentDir = join(testDir1, "non-existent-directory");
      const result = await getValidRootDirectories([
        { uri: pathToFileURL(testDir1).href, name: "Valid Dir" },
        { uri: pathToFileURL(nonExistentDir).href },
        { uri: pathToFileURL(testFile).href },
        { uri: "file://\0invalid\0path" },
      ]);
      expect(result).toEqual([testDir1]);
      expect(console.error).toHaveBeenCalledWith(
        `Skipping non-directory root: ${testFile}`,
      );
      expect(console.error).toHaveBeenCalledWith(
        `Skipping invalid path or inaccessible: ${pathToFileURL(nonExistentDir).href}`,
      );
    });

    it("drops a root whose stat fails after realpath succeeded, logging the error", async () => {
      vi.spyOn(fsp, "stat")
        .mockRejectedValueOnce(new Error("EACCES"))
        .mockRejectedValueOnce("not an Error");
      const result = await getValidRootDirectories([
        { uri: testDir1 },
        { uri: testDir2 },
      ]);
      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalledWith(
        `Skipping invalid directory: ${testDir1} due to error: EACCES`,
      );
      expect(console.error).toHaveBeenCalledWith(
        `Skipping invalid directory: ${testDir2} due to error: not an Error`,
      );
    });
  });
});
