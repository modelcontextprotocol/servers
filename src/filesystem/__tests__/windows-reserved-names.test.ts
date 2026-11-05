// Windows reserved device names (CON, NUL, COM1, …) and path components
// ending in a dot or a space are refused on Windows (#5444), checked on any
// host. As in win32.test.ts and alternate-data-streams.test.ts, the `path`
// module is replaced by `path.win32` and `process.platform` reads "win32", so
// path-validation.ts takes its Windows branch on macOS and Linux CI too. The
// refusal happens before any file system call, so a server built for a
// Windows drive path can be driven over the protocol without that drive.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("path", async () => {
  const actual = await vi.importActual<typeof import("path")>("path");
  return { ...actual.win32, default: actual.win32 };
});
// version.ts finds package.json by walking up a POSIX path, which path.win32
// cannot do; the version is irrelevant to these tests.
vi.mock("../version.js", () => ({ SERVER_VERSION: "0.0.0-test" }));

const {
  hasTrailingDotOrSpace,
  isPathWithinAllowedDirectories,
  namesWindowsDevice,
} = await import("../path-validation.js");
const { validatePath } = await import("../lib.js");
const { call, connect, quietStderr, textOf } = await import("./helpers.js");

const realPlatform = process.platform;

beforeAll(() => {
  Object.defineProperty(process, "platform", { value: "win32" });
});

afterAll(() => {
  Object.defineProperty(process, "platform", { value: realPlatform });
});

const DEVICE = /Windows reserved device names .* are not supported/;
const TRAILING = /ending in a dot or a space are not supported/;

describe("namesWindowsDevice on win32", () => {
  it.each([
    "C:\\work\\CON",
    "C:\\work\\con",
    "C:\\work\\Nul",
    "C:\\work\\PRN",
    "C:\\work\\AUX",
    "C:\\work\\COM1",
    "C:\\work\\com9",
    "C:\\work\\LPT1",
    "C:\\work\\lpt9",
    "C:\\work\\COM\u00b9",
    "C:\\work\\LPT\u00b3",
    "C:\\work\\NUL.txt",
    "C:\\work\\com1.tar.gz",
    "C:\\work\\CON .txt",
    "C:\\work\\aux\\file.txt",
    "\\\\?\\C:\\work\\NUL",
    "\\\\.\\NUL",
    "\\\\server\\share\\PRN.log",
  ])("refuses %s", (p) => {
    expect(namesWindowsDevice(p)).toBe(true);
  });

  it.each([
    "C:\\work\\file.txt",
    "C:\\",
    "C:\\work\\CONFIG",
    "C:\\work\\console.log",
    "C:\\work\\nullable.ts",
    "C:\\work\\COM",
    "C:\\work\\COM10",
    "C:\\work\\COM0",
    "C:\\work\\LPT",
    "C:\\work\\auxiliary",
    "C:\\work\\my-con.txt",
    "C:\\work\\CON foo.txt",
    "C:\\work\\.nul",
    "\\\\?\\C:\\work\\file.txt",
    "\\\\server\\share\\file.txt",
  ])("accepts %s", (p) => {
    expect(namesWindowsDevice(p)).toBe(false);
  });
});

describe("hasTrailingDotOrSpace on win32", () => {
  it.each([
    "C:\\work\\file.txt.",
    "C:\\work\\file.txt ",
    "C:\\work\\file.txt. ",
    "C:\\work\\dir.\\file.txt",
    "C:\\work\\dir \\file.txt",
    "C:\\work\\...",
    "\\\\?\\C:\\work\\file.txt.",
    "\\\\server\\share\\file.txt ",
  ])("refuses %s", (p) => {
    expect(hasTrailingDotOrSpace(p)).toBe(true);
  });

  // `.` and `..` are directory references, not names with a trailing dot;
  // the `\\.\` device-namespace prefix keeps a lone `.`; the drive is not a
  // name; and only trailing dots and spaces are stripped, never leading ones.
  it.each([
    "C:\\work\\file.txt",
    "C:\\",
    "C:\\work\\.hidden",
    "C:\\work\\ leading-space.txt",
    "C:\\work\\a.b.c",
    "C:\\work\\.\\file.txt",
    "C:\\work\\..\\file.txt",
    "\\\\.\\C:\\work\\file.txt",
    "\\\\?\\C:\\work\\file.txt",
  ])("accepts %s", (p) => {
    expect(hasTrailingDotOrSpace(p)).toBe(false);
  });
});

describe("isPathWithinAllowedDirectories on win32 refuses device names and trailing dots or spaces", () => {
  it("throws for a device name inside an allowed directory", () => {
    expect(() =>
      isPathWithinAllowedDirectories("C:\\work\\NUL", ["C:\\work"]),
    ).toThrow(DEVICE);
    expect(() =>
      isPathWithinAllowedDirectories("C:\\work\\com1.txt", ["C:\\work"]),
    ).toThrow(DEVICE);
  });

  it("throws for a device name as an intermediate directory", () => {
    expect(() =>
      isPathWithinAllowedDirectories("C:\\work\\CON\\file.txt", ["C:\\work"]),
    ).toThrow(DEVICE);
  });

  it("throws for a trailing dot or space on the file or a directory", () => {
    expect(() =>
      isPathWithinAllowedDirectories("C:\\work\\file.txt.", ["C:\\work"]),
    ).toThrow(TRAILING);
    expect(() =>
      isPathWithinAllowedDirectories("C:\\work\\file.txt ", ["C:\\work"]),
    ).toThrow(TRAILING);
    expect(() =>
      isPathWithinAllowedDirectories("C:\\work\\sub.\\file.txt", ["C:\\work"]),
    ).toThrow(TRAILING);
  });

  it("throws behind the \\\\?\\ long-path prefix too", () => {
    expect(() =>
      isPathWithinAllowedDirectories("\\\\?\\C:\\work\\file.txt.", [
        "\\\\?\\C:\\work",
      ]),
    ).toThrow(TRAILING);
  });

  it("names the requested path in the error", () => {
    expect(() =>
      isPathWithinAllowedDirectories("C:\\work\\aux.log", ["C:\\work"]),
    ).toThrow("C:\\work\\aux.log");
  });

  // `.` and `..` are folded by resolve before the checks run, so they reach
  // the containment check like any other spelling of the same path.
  it("leaves . and .. components to the containment check", () => {
    expect(
      isPathWithinAllowedDirectories("C:\\work\\.\\a.txt", ["C:\\work"]),
    ).toBe(true);
    expect(
      isPathWithinAllowedDirectories("C:\\work\\sub\\..\\a.txt", ["C:\\work"]),
    ).toBe(true);
    expect(
      isPathWithinAllowedDirectories("C:\\work\\..\\other\\a.txt", [
        "C:\\work",
      ]),
    ).toBe(false);
  });

  it("leaves ordinary names that merely resemble devices alone", () => {
    expect(
      isPathWithinAllowedDirectories("C:\\work\\console.log", ["C:\\work"]),
    ).toBe(true);
    expect(
      isPathWithinAllowedDirectories("C:\\work\\COM10", ["C:\\work"]),
    ).toBe(true);
  });
});

describe("validatePath on win32 refuses device names and trailing dots or spaces", () => {
  it("reports the device refusal, not 'outside allowed directories'", async () => {
    await expect(validatePath("C:\\work\\NUL", ["C:\\work"])).rejects.toThrow(
      DEVICE,
    );
  });

  it("refuses a relative path with a trailing dot", async () => {
    await expect(validatePath("notes.txt.", ["C:\\work"])).rejects.toThrow(
      TRAILING,
    );
  });
});

describe("the tools on win32 refuse device names and trailing dots or spaces", () => {
  it("returns each refusal as a tool error", async () => {
    quietStderr();
    const conn = await connect(["C:\\work"]);
    try {
      const read = await call(conn.client, "read_text_file", {
        path: "C:\\work\\CON",
      });
      expect(read.isError).toBe(true);
      expect(textOf(read)).toMatch(DEVICE);

      const write = await call(conn.client, "write_file", {
        path: "C:\\work\\notes.txt.",
        content: "payload",
      });
      expect(write.isError).toBe(true);
      expect(textOf(write)).toMatch(TRAILING);
    } finally {
      await conn.close();
      vi.restoreAllMocks();
    }
  });
});
