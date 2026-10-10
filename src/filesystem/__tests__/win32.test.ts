// Windows path handling, characterized on any host (#4854). The `path` module
// is replaced by `path.win32` and `process.platform` reads "win32", so the
// Windows-only branches of path-utils.ts and path-validation.ts run here:
// drive roots, bare drive letters, backslash conversion and UNC shares.

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

  // #3527: path.resolve keeps a UNC share root's trailing backslash, so the
  // prefix check must not append a second one.
  it("accepts a subdirectory of a UNC share allowed directory (#3527)", () => {
    expect(
      isPathWithinAllowedDirectories("\\\\server\\share\\sub", [
        "\\\\server\\share\\",
      ]),
    ).toBe(true);
  });

  it("accepts a deep path under a UNC share given without a trailing backslash", () => {
    expect(
      isPathWithinAllowedDirectories("\\\\server\\share\\a b\\.c\\f.txt", [
        "\\\\server\\share",
      ]),
    ).toBe(true);
  });

  it("refuses a sibling share whose name extends the allowed share's", () => {
    expect(
      isPathWithinAllowedDirectories("\\\\server\\share-evil\\x", [
        "\\\\server\\share\\",
      ]),
    ).toBe(false);
    expect(
      isPathWithinAllowedDirectories("\\\\server\\share-evil", [
        "\\\\server\\share",
      ]),
    ).toBe(false);
  });

  it("refuses another share, and the same share on another server", () => {
    expect(
      isPathWithinAllowedDirectories("\\\\server\\other\\x", [
        "\\\\server\\share\\",
      ]),
    ).toBe(false);
    expect(
      isPathWithinAllowedDirectories("\\\\server2\\share\\x", [
        "\\\\server\\share\\",
      ]),
    ).toBe(false);
  });

  it("keeps a .. that climbs past a UNC share root inside that share", () => {
    // Node clamps .. at the share root, so this resolves to \\server\share\other.
    expect(
      isPathWithinAllowedDirectories("\\\\server\\share\\..\\other\\x", [
        "\\\\server\\share\\",
      ]),
    ).toBe(true);
    expect(
      isPathWithinAllowedDirectories("\\\\server\\share\\sub\\..\\..\\x", [
        "\\\\server\\share\\sub",
      ]),
    ).toBe(false);
  });
});
