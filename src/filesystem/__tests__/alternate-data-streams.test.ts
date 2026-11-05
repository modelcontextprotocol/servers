// NTFS alternate-data-stream paths are refused on Windows (#5375), checked on
// any host. As in win32.test.ts, the `path` module is replaced by `path.win32`
// and `process.platform` reads "win32", so path-validation.ts takes its
// Windows branch here on macOS and Linux CI too. The refusal happens before
// any file system call, so a server built for a Windows drive path can be
// driven over the protocol without that drive existing.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("path", async () => {
  const actual = await vi.importActual<typeof import("path")>("path");
  return { ...actual.win32, default: actual.win32 };
});
// version.ts finds package.json by walking up a POSIX path, which path.win32
// cannot do; the version is irrelevant to these tests.
vi.mock("../version.js", () => ({ SERVER_VERSION: "0.0.0-test" }));

const { isPathWithinAllowedDirectories, namesAlternateDataStream } =
  await import("../path-validation.js");
const { call, connect, quietStderr, textOf } = await import("./helpers.js");

const realPlatform = process.platform;

beforeAll(() => {
  Object.defineProperty(process, "platform", { value: "win32" });
});

afterAll(() => {
  Object.defineProperty(process, "platform", { value: realPlatform });
});

const REFUSAL = /NTFS alternate data stream paths are not supported/;

describe("namesAlternateDataStream on win32", () => {
  it.each([
    "C:\\work\\file.txt",
    "C:\\",
    "\\\\server\\share\\file.txt",
    "\\\\?\\C:\\work\\file.txt",
    "\\\\.\\C:\\work\\file.txt",
    "\\\\?\\UNC\\server\\share\\file.txt",
  ])("accepts %s, whose only colon is the drive's", (p) => {
    expect(namesAlternateDataStream(p)).toBe(false);
  });

  it.each([
    "C:\\work\\file.txt:stream",
    "C:\\work\\file.txt::$DATA",
    "C:\\work\\file.txt:stream:$DATA",
    "C:\\work:stream",
    "\\\\server\\share\\file.txt:stream",
    "\\\\?\\C:\\work\\file.txt:stream",
    "\\\\?\\UNC\\server\\share\\file.txt:stream",
    "work\\file.txt:stream",
    "AB:\\work",
  ])("refuses %s, which has a colon past the drive prefix", (p) => {
    expect(namesAlternateDataStream(p)).toBe(true);
  });
});

describe("isPathWithinAllowedDirectories on win32 refuses alternate streams", () => {
  it("throws for a stream on a file inside an allowed directory", () => {
    expect(() =>
      isPathWithinAllowedDirectories("C:\\work\\file.txt:hidden", ["C:\\work"]),
    ).toThrow(REFUSAL);
  });

  it("throws for the default stream spelled out (::$DATA)", () => {
    expect(() =>
      isPathWithinAllowedDirectories("C:\\work\\file.txt::$DATA", ["C:\\work"]),
    ).toThrow(REFUSAL);
  });

  // The issue noted this one already failed containment; it stays refused.
  it("throws for a stream on the allowed directory itself", () => {
    expect(() =>
      isPathWithinAllowedDirectories("C:\\work:stream", ["C:\\work"]),
    ).toThrow(REFUSAL);
  });

  it("throws for a stream under a drive-root allowed directory", () => {
    expect(() =>
      isPathWithinAllowedDirectories("C:\\file.txt:s", ["C:\\"]),
    ).toThrow(REFUSAL);
  });

  it("throws for a stream on a UNC share path", () => {
    expect(() =>
      isPathWithinAllowedDirectories("\\\\server\\share\\f.txt:s", [
        "\\\\server\\share",
      ]),
    ).toThrow(REFUSAL);
  });

  it("throws for a stream behind the \\\\?\\ long-path prefix", () => {
    expect(() =>
      isPathWithinAllowedDirectories("\\\\?\\C:\\work\\f.txt:s", [
        "\\\\?\\C:\\work",
      ]),
    ).toThrow(REFUSAL);
  });

  it("still accepts a \\\\?\\ long path under a directory spelled the same way", () => {
    expect(
      isPathWithinAllowedDirectories("\\\\?\\C:\\work\\f.txt", [
        "\\\\?\\C:\\work",
      ]),
    ).toBe(true);
  });

  // A drive-relative path resolves against that drive's current directory,
  // so its own colon is the drive's and only a further one is a stream.
  it("accepts a drive-relative path and refuses a stream on one", () => {
    expect(isPathWithinAllowedDirectories("C:file.txt", ["C:\\"])).toBe(true);
    expect(() =>
      isPathWithinAllowedDirectories("C:file.txt:s", ["C:\\"]),
    ).toThrow(REFUSAL);
  });

  it("names the requested path in the error", () => {
    expect(() =>
      isPathWithinAllowedDirectories("C:\\work\\a.txt:s", ["C:\\work"]),
    ).toThrow("C:\\work\\a.txt:s");
  });

  it("leaves ordinary paths to the containment check", () => {
    expect(
      isPathWithinAllowedDirectories("C:\\work\\a.txt", ["C:\\work"]),
    ).toBe(true);
    expect(
      isPathWithinAllowedDirectories("D:\\other\\a.txt", ["C:\\work"]),
    ).toBe(false);
  });
});

describe("the tools on win32 refuse alternate streams", () => {
  it("returns the refusal as a tool error for a read and a write", async () => {
    quietStderr();
    const conn = await connect(["C:\\work"]);
    try {
      const read = await call(conn.client, "read_text_file", {
        path: "C:\\work\\notes.txt:hidden",
      });
      expect(read.isError).toBe(true);
      expect(textOf(read)).toMatch(REFUSAL);

      const write = await call(conn.client, "write_file", {
        path: "C:\\work\\notes.txt::$DATA",
        content: "payload",
      });
      expect(write.isError).toBe(true);
      expect(textOf(write)).toMatch(REFUSAL);
    } finally {
      await conn.close();
      vi.restoreAllMocks();
    }
  });

  // validatePath runs the stream check before the containment check, so the
  // error names the stream rather than "outside allowed directories".
  it("reports the stream refusal, not 'outside allowed directories'", async () => {
    quietStderr();
    const conn = await connect(["C:\\work"]);
    try {
      const result = await call(conn.client, "read_text_file", {
        path: "C:\\work\\file.txt:hidden",
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(REFUSAL);
      expect(textOf(result)).not.toMatch(/outside allowed directories/);
    } finally {
      await conn.close();
      vi.restoreAllMocks();
    }
  });

  it("refuses a relative path that names a stream", async () => {
    quietStderr();
    const conn = await connect(["C:\\work"]);
    try {
      const result = await call(conn.client, "read_text_file", {
        path: "file.txt:hidden",
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(REFUSAL);
    } finally {
      await conn.close();
      vi.restoreAllMocks();
    }
  });
});
