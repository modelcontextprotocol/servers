// Windows path handling, characterized on any host (#4854). The `path` module
// is replaced by `path.win32` and `process.platform` reads "win32", so the
// Windows-only branches of path-utils.ts and path-validation.ts run here:
// drive roots, bare drive letters, backslash conversion and UNC shares. #3527
// (a UNC share as the allowed root refuses its own subdirectories) is pinned
// as it stands.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("path", async () => {
  const actual = await vi.importActual<typeof import("path")>("path");
  return { ...actual.win32, default: actual.win32 };
});

const { normalizePath } = await import("../path-utils.js");
const { isPathWithinAllowedDirectories } =
  await import("../path-validation.js");

const realPlatform = process.platform;

beforeAll(() => {
  Object.defineProperty(process, "platform", { value: "win32" });
});

afterAll(() => {
  Object.defineProperty(process, "platform", { value: realPlatform });
});

describe("normalizePath on win32", () => {
  it("gives a bare drive letter a separator rather than C:.", () => {
    expect(normalizePath("C:")).toBe("C:\\");
  });

  it("converts a relative path's slashes to backslashes", () => {
    expect(normalizePath("foo/bar")).toBe("foo\\bar");
  });

  it("converts a /c/ path to a drive path and capitalizes the drive", () => {
    expect(normalizePath("/c/Users/me")).toBe("C:\\Users\\me");
    expect(normalizePath("d:/work")).toBe("D:\\work");
  });

  it("restores the leading backslash path.normalize drops from a bare UNC server", () => {
    expect(normalizePath("\\\\server")).toBe("\\\\server");
  });

  it("keeps a UNC share's leading double backslash", () => {
    expect(normalizePath("\\\\\\server\\\\share\\dir")).toBe(
      "\\\\server\\share\\dir",
    );
  });
});

describe("isPathWithinAllowedDirectories on win32", () => {
  it("accepts any path on the drive of a drive-root allowed directory", () => {
    expect(isPathWithinAllowedDirectories("C:\\Users\\me", ["C:\\"])).toBe(
      true,
    );
  });

  // The drive letters are compared case-insensitively, but the prefix check
  // is not, so a lowercase drive is refused here. validatePath never passes
  // one: normalizePath capitalizes the drive first.
  it("refuses a lowercase drive letter that was not normalized first", () => {
    expect(isPathWithinAllowedDirectories("c:\\Users\\me", ["C:\\"])).toBe(
      false,
    );
  });

  it("refuses a path on another drive", () => {
    expect(isPathWithinAllowedDirectories("D:\\data", ["C:\\"])).toBe(false);
  });

  it("accepts a subdirectory of an ordinary allowed directory", () => {
    expect(isPathWithinAllowedDirectories("C:\\work\\repo", ["C:\\work"])).toBe(
      true,
    );
  });

  it("accepts a UNC share's own root", () => {
    expect(
      isPathWithinAllowedDirectories("\\\\server\\share", [
        "\\\\server\\share\\",
      ]),
    ).toBe(true);
  });

  // #3527: path.resolve keeps a UNC root's trailing backslash, and the prefix
  // check appends another, so nothing below the share matches.
  it("refuses a subdirectory of a UNC share allowed directory (#3527)", () => {
    expect(
      isPathWithinAllowedDirectories("\\\\server\\share\\sub", [
        "\\\\server\\share\\",
      ]),
    ).toBe(false);
  });
});
