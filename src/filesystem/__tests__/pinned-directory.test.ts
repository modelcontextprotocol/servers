// Unit tests for pinned-directory.ts, on the real filesystem. The protocol-level
// tests in server-tools.test.ts stage the directory swaps an attacker would
// race; these cover each helper's own contract and failure paths, including
// the Windows branch (stood in for by setting process.platform) and the
// working-directory bookkeeping a borrowed chdir needs.

import { execFileSync } from "child_process";
import fs, { type BigIntStats } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDirectoryInPlace,
  createFileInDirectory,
  isChildDirectory,
  isSameDirectory,
  moveFileAcrossDevices,
  openFileForReading,
  overwriteFileInDirectory,
  readFileInDirectory,
  renameIntoDirectory,
  statInDirectory,
} from "../pinned-directory.js";
import { makeTempDir } from "./helpers.js";

const symlinks = process.platform !== "win32";
const realPlatform = process.platform;
// The identity check compares BigInt stats (#5154), so every expected stat a
// test hands it is one.
const lstatBig = (p: string) => fs.lstatSync(p, { bigint: true });
const errno = (code: string) =>
  Object.assign(new Error(`${code}: stand-in`), { code });

let dir: string;
let outside: string;
let cwd: string;

beforeEach(async () => {
  cwd = process.cwd();
  dir = await makeTempDir("mcp-fs-pinned-");
  outside = await makeTempDir("mcp-fs-pinned-outside-");
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process, "platform", { value: realPlatform });
  process.chdir(cwd);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe("isSameDirectory", () => {
  const nfc = "/tmp/caf\u00e9/proj";
  const nfd = "/tmp/cafe\u0301/proj";

  it("compares byte for byte off macOS, where an NFC and an NFD twin can coexist", () => {
    expect(isSameDirectory(nfc, nfc, "linux")).toBe(true);
    expect(isSameDirectory(nfd, nfc, "linux")).toBe(false);
    expect(
      isSameDirectory(
        "/Users/me/p",
        "/System/Volumes/Data/Users/me/p",
        "linux",
      ),
    ).toBe(false);
  });

  it("compares byte for byte on macOS too, where an NFS mount can hold twins", () => {
    expect(isSameDirectory(nfd, nfc, "darwin")).toBe(false);
    expect(isSameDirectory(nfc, nfc, "darwin")).toBe(true);
  });

  it("treats the macOS Data-volume spelling as the firmlinked one", () => {
    expect(
      isSameDirectory(
        "/Users/me/p",
        "/System/Volumes/Data/Users/me/p",
        "darwin",
      ),
    ).toBe(true);
    expect(
      isSameDirectory(
        "/System/Volumes/Data/x",
        "/System/Volumes/Data/x",
        "darwin",
      ),
    ).toBe(true);
    expect(
      isSameDirectory(
        "/Users/me/q",
        "/System/Volumes/Data/Users/me/p",
        "darwin",
      ),
    ).toBe(false);
  });

  it("reads the platform from the process by default", () => {
    expect(isSameDirectory(nfc, nfc)).toBe(true);
  });
});

describe("isChildDirectory", () => {
  it("compares the parent exactly and the last component in NFC", () => {
    expect(isChildDirectory("/p/cafe\u0301", "/p", "caf\u00e9", "darwin")).toBe(
      true,
    );
    expect(isChildDirectory("/q/caf\u00e9", "/p", "caf\u00e9", "darwin")).toBe(
      false,
    );
    expect(isChildDirectory("/caf\u00e9/x", "/cafe\u0301", "x", "linux")).toBe(
      false,
    );
    expect(isChildDirectory("/p/y", "/p", "x", "linux")).toBe(false);
  });

  it("reads the platform from the process by default", () => {
    expect(isChildDirectory("/p/x", "/p", "x")).toBe(true);
  });
});

describe("createFileInDirectory", () => {
  it("creates the file, writes it and restores the working directory", async () => {
    const file = path.join(dir, "new.txt");
    await createFileInDirectory(file, "hello");
    expect(fs.readFileSync(file, "utf-8")).toBe("hello");
    expect(process.cwd()).toBe(cwd);
  });

  it("fails with EEXIST on an existing file", async () => {
    const file = path.join(dir, "old.txt");
    fs.writeFileSync(file, "old");
    await expect(createFileInDirectory(file, "new")).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(fs.readFileSync(file, "utf-8")).toBe("old");
    expect(process.cwd()).toBe(cwd);
  });

  it.skipIf(!symlinks)(
    "refuses a directory that resolves somewhere else",
    async () => {
      fs.symlinkSync(outside, path.join(dir, "link"));
      await expect(
        createFileInDirectory(path.join(dir, "link", "x.txt"), "x"),
      ).rejects.toThrow(
        "Access denied - a directory on the path changed during the operation",
      );
      expect(fs.readdirSync(outside)).toEqual([]);
    },
  );

  it("refuses, and closes the file, when the path no longer holds what was opened", async () => {
    const realLstat = fs.lstatSync;
    vi.spyOn(fs, "lstatSync").mockImplementationOnce((p) => ({
      ...realLstat(p, { bigint: true }),
      ino: -1n,
    }));
    const closeSync = vi.spyOn(fs, "closeSync");
    await expect(
      createFileInDirectory(path.join(dir, "x.txt"), "x"),
    ).rejects.toThrow("Access denied");
    expect(closeSync).toHaveBeenCalled();
  });

  it("closes the file when the write fails", async () => {
    vi.spyOn(fs, "writeFile").mockImplementationOnce(((...args: unknown[]) => {
      (args[args.length - 1] as (error: Error) => void)(errno("ENOSPC"));
    }) as typeof fs.writeFile);
    const close = vi.spyOn(fs, "close");
    await expect(
      createFileInDirectory(path.join(dir, "x.txt"), "x"),
    ).rejects.toThrow("ENOSPC");
    expect(close).toHaveBeenCalled();
  });

  it("reports a close failure", async () => {
    const realClose = fs.close;
    vi.spyOn(fs, "close").mockImplementationOnce(((
      fd: number,
      callback: (error: Error) => void,
    ) => realClose(fd, () => callback(errno("EIO")))) as typeof fs.close);
    await expect(
      createFileInDirectory(path.join(dir, "x.txt"), "x"),
    ).rejects.toThrow("EIO");
  });

  it.skipIf(!symlinks)(
    "on Windows, where the working directory proves nothing, still refuses when the path no longer holds what was opened",
    async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      fs.symlinkSync(outside, path.join(dir, "link"));
      const realLstat = fs.lstatSync;
      vi.spyOn(fs, "lstatSync").mockImplementationOnce((p) => ({
        ...realLstat(p, { bigint: true }),
        ino: -1n,
      }));
      await expect(
        createFileInDirectory(path.join(dir, "link", "x.txt"), "x"),
      ).rejects.toThrow("Access denied");
    },
  );
});

describe("overwriteFileInDirectory", () => {
  it("replaces the content in place, keeping the inode", async () => {
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "a much longer original");
    const expected = lstatBig(file);
    await overwriteFileInDirectory(file, "short", expected);
    expect(fs.readFileSync(file, "utf-8")).toBe("short");
    expect(lstatBig(file).ino).toBe(expected.ino);
  });

  it("refuses a file other than the one expected", async () => {
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "original");
    const expected = { ...lstatBig(file), ino: -1n };
    await expect(
      overwriteFileInDirectory(file, "new", expected),
    ).rejects.toThrow(
      `Refusing to write: ${file} was replaced while it was being opened`,
    );
    expect(fs.readFileSync(file, "utf-8")).toBe("original");
  });

  it("refuses something that is not a regular file", async () => {
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "original");
    const expected = lstatBig(file);
    const realFstat = fs.fstatSync;
    vi.spyOn(fs, "fstatSync").mockImplementationOnce((fd) => {
      const stats = realFstat(fd, { bigint: true });
      return Object.assign(stats, { isFile: () => false });
    });
    await expect(
      overwriteFileInDirectory(file, "new", expected),
    ).rejects.toThrow("was replaced while it was being opened");
  });

  it("reports a truncate failure, and closes the file", async () => {
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "original");
    vi.spyOn(fs, "ftruncate").mockImplementationOnce(((...args: unknown[]) => {
      (args[args.length - 1] as (error: Error) => void)(errno("EIO"));
    }) as typeof fs.ftruncate);
    const close = vi.spyOn(fs, "close");
    await expect(
      overwriteFileInDirectory(file, "new", lstatBig(file)),
    ).rejects.toThrow("EIO");
    expect(close).toHaveBeenCalled();
    expect(fs.readFileSync(file, "utf-8")).toBe("original");
  });

  it.skipIf(!symlinks)("fails with ELOOP on a symlink", async () => {
    const target = path.join(outside, "t.txt");
    fs.writeFileSync(target, "SECRET");
    const link = path.join(dir, "l.txt");
    fs.symlinkSync(target, link);
    await expect(
      overwriteFileInDirectory(
        link,
        "pwned",
        fs.statSync(target, { bigint: true }),
      ),
    ).rejects.toMatchObject({ code: "ELOOP" });
    expect(fs.readFileSync(target, "utf-8")).toBe("SECRET");
  });
});

describe("on Windows, where O_NOFOLLOW does not exist", () => {
  it.skipIf(!symlinks)(
    "refuses to overwrite through a symlink at the leaf",
    async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      const target = path.join(outside, "t.txt");
      fs.writeFileSync(target, "SECRET");
      const link = path.join(dir, "l.txt");
      fs.symlinkSync(target, link);
      await expect(
        overwriteFileInDirectory(
          link,
          "pwned",
          fs.statSync(target, { bigint: true }),
        ),
      ).rejects.toThrow(`Refusing to write: not a regular file: ${link}`);
      expect(fs.readFileSync(target, "utf-8")).toBe("SECRET");
    },
  );

  it("overwrites a regular file", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "original");
    await overwriteFileInDirectory(file, "new", lstatBig(file));
    expect(fs.readFileSync(file, "utf-8")).toBe("new");
  });
});

describe("the identity check (#5154)", () => {
  it("compares inodes exactly, where a number stat would round a 64-bit file id", async () => {
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "original");
    const high = 2n ** 53n;
    // The premise: as doubles, these two file ids are one number.
    expect(Number(high + 1n)).toBe(Number(high));
    const expected = { ...lstatBig(file), ino: high };
    const realFstat = fs.fstatSync;
    const realLstat = fs.lstatSync;
    // Persistent and prototype-preserving: on Windows openInDirectory lstats
    // the name once for its symlink check before the identity check.
    vi.spyOn(fs, "fstatSync").mockImplementation((fd) =>
      Object.assign(realFstat(fd, { bigint: true }), { ino: high + 1n }),
    );
    vi.spyOn(fs, "lstatSync").mockImplementation((p) =>
      Object.assign(realLstat(p, { bigint: true }), { ino: high + 1n }),
    );
    await expect(
      overwriteFileInDirectory(file, "new", expected),
    ).rejects.toThrow("was replaced while it was being opened");
    expect(fs.readFileSync(file, "utf-8")).toBe("original");
  });

  describe("on Windows, where a path stat can report no device (libuv < 1.51.0)", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "win32" });
    });

    it("overwrites when inode, size and mtime all match", async () => {
      const file = path.join(dir, "f.txt");
      fs.writeFileSync(file, "original");
      const expected = { ...lstatBig(file), dev: 0n };
      await overwriteFileInDirectory(file, "new", expected);
      expect(fs.readFileSync(file, "utf-8")).toBe("new");
    });

    it("creates a file whose path stat reports no device", async () => {
      const realLstat = fs.lstatSync;
      vi.spyOn(fs, "lstatSync").mockImplementationOnce((p) => ({
        ...realLstat(p, { bigint: true }),
        dev: 0n,
      }));
      const file = path.join(dir, "new.txt");
      await createFileInDirectory(file, "hello");
      expect(fs.readFileSync(file, "utf-8")).toBe("hello");
    });

    it.each([
      ["inode", (s: BigIntStats) => ({ ino: s.ino + 1n })],
      ["size", (s: BigIntStats) => ({ size: s.size + 1n })],
      ["mtime", (s: BigIntStats) => ({ mtimeNs: s.mtimeNs - 1n })],
    ])("refuses when the %s differs", async (_field, change) => {
      const file = path.join(dir, "f.txt");
      fs.writeFileSync(file, "original");
      const stats = lstatBig(file);
      const expected = { ...stats, dev: 0n, ...change(stats) };
      await expect(
        overwriteFileInDirectory(file, "new", expected),
      ).rejects.toThrow("was replaced while it was being opened");
      expect(fs.readFileSync(file, "utf-8")).toBe("original");
    });

    it("refuses a known device that differs", async () => {
      const file = path.join(dir, "f.txt");
      fs.writeFileSync(file, "original");
      const stats = lstatBig(file);
      const expected = { ...stats, dev: stats.dev + 1n };
      await expect(
        overwriteFileInDirectory(file, "new", expected),
      ).rejects.toThrow("was replaced while it was being opened");
    });
  });

  it.skipIf(realPlatform === "win32")(
    "off Windows, refuses a path stat that reports no device",
    async () => {
      const file = path.join(dir, "f.txt");
      fs.writeFileSync(file, "original");
      const expected = { ...lstatBig(file), dev: 0n };
      await expect(
        overwriteFileInDirectory(file, "new", expected),
      ).rejects.toThrow("was replaced while it was being opened");
    },
  );

  // Checked on the windows-latest leg: the device fallback above exists for
  // a Node line this package does not support. If a supported line ever
  // reports no device for a path, the fallback becomes the normal path, and
  // this fails to say so.
  it.skipIf(realPlatform !== "win32")(
    "on a real Windows volume, the path stat and the handle agree on a nonzero device and the inode",
    () => {
      const file = path.join(dir, "f.txt");
      fs.writeFileSync(file, "original");
      const fd = fs.openSync(file, "r");
      try {
        const handle = fs.fstatSync(fd, { bigint: true });
        const byPath = lstatBig(file);
        expect(byPath.dev).not.toBe(0n);
        expect(byPath.dev).toBe(handle.dev);
        expect(byPath.ino).toBe(handle.ino);
      } finally {
        fs.closeSync(fd);
      }
    },
  );
});

describe("renameIntoDirectory", () => {
  it("moves the entry into the destination directory", () => {
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    renameIntoDirectory(
      path.join(dir, "a.txt"),
      path.join(dir, "sub", "b.txt"),
    );
    expect(fs.readFileSync(path.join(dir, "sub", "b.txt"), "utf-8")).toBe("a");
    expect(process.cwd()).toBe(cwd);
  });

  it.skipIf(!symlinks)(
    "refuses a destination directory that resolves somewhere else",
    () => {
      fs.symlinkSync(outside, path.join(dir, "link"));
      fs.writeFileSync(path.join(dir, "a.txt"), "a");
      expect(() =>
        renameIntoDirectory(
          path.join(dir, "a.txt"),
          path.join(dir, "link", "b.txt"),
        ),
      ).toThrow("Access denied");
      expect(fs.readdirSync(outside)).toEqual([]);
      expect(fs.existsSync(path.join(dir, "a.txt"))).toBe(true);
    },
  );

  const movingNames = (directory: string) =>
    fs.readdirSync(directory).filter((n) => n.endsWith(".moving"));

  // Stand in for renameSync, calling `around(call, from, to, real)` on each
  // call; the first call is step 1 (inside the source's directory), the
  // second step 2 (across), the third step 3 (to the destination's name).
  const onRename = (
    around: (
      call: number,
      from: fs.PathLike,
      to: fs.PathLike,
      real: typeof fs.renameSync,
    ) => void,
  ) => {
    const realRename = fs.renameSync;
    let call = 0;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) =>
      around(++call, from, to, realRename),
    );
  };

  // The source's directory swapped for a link to an outside one between
  // step 1 and step 2: step 2's path now leads outside, where nothing has
  // the fresh name, so nothing comes in from there.
  const swapSourceBeforeStep2 = (before?: (held: string) => void) =>
    onRename((call, from, to, real) => {
      if (call === 2) {
        real(path.join(dir, "sub"), path.join(dir, "sub-real"));
        fs.symlinkSync(outside, path.join(dir, "sub"));
        before?.(path.basename(String(from)));
      }
      real(from, to);
    });

  it.skipIf(!symlinks)(
    "never brings in an outside entry when the source directory is swapped",
    () => {
      fs.mkdirSync(path.join(dir, "sub"));
      fs.writeFileSync(path.join(dir, "sub", "x.conf"), "inside");
      fs.writeFileSync(path.join(outside, "x.conf"), "secret");
      swapSourceBeforeStep2();
      expect(() =>
        renameIntoDirectory(
          path.join(dir, "sub", "x.conf"),
          path.join(dir, "moved.conf"),
        ),
      ).toThrow("Access denied");
      // Nothing came in, and nothing left the directory that was moved away:
      // the source stays there under its fresh name, since the swapped path
      // is never entered to put it back.
      expect(fs.readdirSync(outside)).toEqual(["x.conf"]);
      expect(fs.readdirSync(dir).sort()).toEqual(["sub", "sub-real"]);
      const [held] = movingNames(path.join(dir, "sub-real"));
      expect(fs.readFileSync(path.join(dir, "sub-real", held), "utf-8")).toBe(
        "inside",
      );
      expect(process.cwd()).toBe(cwd);
    },
  );

  it("puts back a directory source, which cannot be linked, by renaming it", () => {
    fs.mkdirSync(path.join(dir, "d"));
    fs.mkdirSync(path.join(dir, "sub"));
    onRename((call, from, to, real) => {
      if (call === 2) {
        throw errno("EXDEV");
      }
      real(from, to);
    });
    expect(() =>
      renameIntoDirectory(path.join(dir, "d"), path.join(dir, "sub", "e")),
    ).toThrow(expect.objectContaining({ code: "EXDEV" }));
    expect(fs.readdirSync(dir).sort()).toEqual(["d", "sub"]);
  });

  it.skipIf(!symlinks)(
    "sends back an entry planted outside under the fresh name",
    () => {
      fs.mkdirSync(path.join(dir, "sub"));
      fs.writeFileSync(path.join(dir, "sub", "x.conf"), "inside");
      let planted = "";
      swapSourceBeforeStep2((held) => {
        planted = held;
        fs.writeFileSync(path.join(outside, held), "secret");
      });
      expect(() =>
        renameIntoDirectory(
          path.join(dir, "sub", "x.conf"),
          path.join(dir, "moved.conf"),
        ),
      ).toThrow("Access denied");
      expect(fs.readFileSync(path.join(outside, planted), "utf-8")).toBe(
        "secret",
      );
      expect(movingNames(dir)).toEqual([]);
      expect(movingNames(path.join(dir, "sub-real"))).toHaveLength(1);
    },
  );

  it("puts the source back, keeping the error's code, when step 2 fails", () => {
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    onRename((call, from, to, real) => {
      if (call === 2) {
        throw errno("EXDEV");
      }
      real(from, to);
    });
    expect(() =>
      renameIntoDirectory(
        path.join(dir, "a.txt"),
        path.join(dir, "sub", "b.txt"),
      ),
    ).toThrow(expect.objectContaining({ code: "EXDEV" }));
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf-8")).toBe("a");
    expect(movingNames(dir)).toEqual([]);
  });

  it("puts the source back when the destination's name cannot be taken", () => {
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    onRename((call, from, to, real) => {
      if (call === 3) {
        throw errno("EISDIR");
      }
      real(from, to);
    });
    expect(() =>
      renameIntoDirectory(
        path.join(dir, "a.txt"),
        path.join(dir, "sub", "b.txt"),
      ),
    ).toThrow(expect.objectContaining({ code: "EISDIR" }));
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf-8")).toBe("a");
    expect(movingNames(dir)).toEqual([]);
    expect(fs.readdirSync(path.join(dir, "sub"))).toEqual([]);
  });

  it("says where the source was left when its name was taken meanwhile", () => {
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    onRename((call, from, to, real) => {
      if (call === 3) {
        fs.writeFileSync(path.join(dir, "a.txt"), "someone else's");
        throw errno("EISDIR");
      }
      real(from, to);
    });
    let error: unknown;
    try {
      renameIntoDirectory(
        path.join(dir, "a.txt"),
        path.join(dir, "sub", "b.txt"),
      );
    } catch (caught) {
      error = caught;
    }
    // Brought back into the source's directory, and checked, but its name
    // was taken, so it stays there under the fresh name.
    const [left] = movingNames(dir);
    expect(error).toMatchObject({
      code: "EISDIR",
      message: expect.stringContaining(`was left as ${left} in ${dir}`),
    });
    expect(fs.readFileSync(path.join(dir, left), "utf-8")).toBe("a");
    expect(movingNames(path.join(dir, "sub"))).toEqual([]);
  });

  it.skipIf(!symlinks)(
    "never restores an entry planted where the destination's directory was swapped",
    () => {
      fs.mkdirSync(path.join(dir, "sub"));
      fs.writeFileSync(path.join(dir, "a.txt"), "a");
      let landing = "";
      onRename((call, from, to, real) => {
        if (call === 3) {
          landing = String(from);
          real(path.join(dir, "sub"), path.join(dir, "sub-real"));
          fs.symlinkSync(outside, path.join(dir, "sub"));
          fs.writeFileSync(path.join(outside, landing), "secret");
          throw errno("EISDIR");
        }
        real(from, to);
      });
      let error: unknown;
      try {
        renameIntoDirectory(
          path.join(dir, "a.txt"),
          path.join(dir, "sub", "b.txt"),
        );
      } catch (caught) {
        error = caught;
      }
      expect(String(error)).toContain(
        `was left as ${landing} in ${path.join(dir, "sub")}`,
      );
      expect(fs.existsSync(path.join(dir, "a.txt"))).toBe(false);
      expect(movingNames(dir)).toEqual([]);
      expect(fs.readFileSync(path.join(outside, landing), "utf-8")).toBe(
        "secret",
      );
      expect(
        fs.readFileSync(path.join(dir, "sub-real", landing), "utf-8"),
      ).toBe("a");
    },
  );

  it("reports the source left when the destination's entry cannot be brought back", () => {
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    onRename((call, from, to, real) => {
      if (call === 3 || call === 4) {
        throw errno(call === 3 ? "EISDIR" : "EIO");
      }
      real(from, to);
    });
    expect(() =>
      renameIntoDirectory(
        path.join(dir, "a.txt"),
        path.join(dir, "sub", "b.txt"),
      ),
    ).toThrow(/was left as \.mcp-[0-9a-f]{16}\.moving in /);
    expect(movingNames(path.join(dir, "sub"))).toHaveLength(1);
  });

  it("drops EXDEV when the source cannot be put back, so no copy follows", () => {
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    onRename((call, from, to, real) => {
      if (call === 2) {
        fs.writeFileSync(path.join(dir, "a.txt"), "someone else's");
        throw errno("EXDEV");
      }
      real(from, to);
    });
    let error: unknown;
    try {
      renameIntoDirectory(
        path.join(dir, "a.txt"),
        path.join(dir, "sub", "b.txt"),
      );
    } catch (caught) {
      error = caught;
    }
    expect((error as NodeJS.ErrnoException).code).toBeUndefined();
    expect((error as Error).cause).toMatchObject({ code: "EXDEV" });
    expect((error as Error).message).toContain("was left as");
  });

  it("says where a directory source was left when its name was taken", () => {
    fs.mkdirSync(path.join(dir, "d"));
    fs.mkdirSync(path.join(dir, "sub"));
    onRename((call, from, to, real) => {
      if (call === 2) {
        fs.writeFileSync(path.join(dir, "d"), "someone else's");
        throw errno("EIO");
      }
      real(from, to);
    });
    expect(() =>
      renameIntoDirectory(path.join(dir, "d"), path.join(dir, "sub", "e")),
    ).toThrow(/was left as \.mcp-[0-9a-f]{16}\.moving in /);
    expect(movingNames(dir)).toHaveLength(1);
  });

  it("leaves the source staged when its directory cannot be checked", () => {
    fs.mkdirSync(path.join(dir, "d"));
    fs.mkdirSync(path.join(dir, "sub"));
    const realLstat = fs.lstatSync;
    onRename((call, from, to, real) => {
      if (call === 2) {
        vi.spyOn(fs, "lstatSync").mockImplementation(((
          p: fs.PathLike,
          options?: fs.StatSyncOptions,
        ) => {
          if (p === "d") {
            throw errno("EACCES");
          }
          return realLstat(p, options);
        }) as never);
        throw errno("EIO");
      }
      real(from, to);
    });
    expect(() =>
      renameIntoDirectory(path.join(dir, "d"), path.join(dir, "sub", "e")),
    ).toThrow("was left as");
    expect(movingNames(dir)).toHaveLength(1);
  });

  it("reports the source left when its directory can no longer be entered", () => {
    fs.mkdirSync(path.join(dir, "sub"));
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "src", "a.txt"), "a");
    onRename((call, from, to, real) => {
      if (call === 2) {
        fs.renameSync(path.join(dir, "src"), path.join(dir, "src-gone"));
        throw errno("EIO");
      }
      real(from, to);
    });
    expect(() =>
      renameIntoDirectory(
        path.join(dir, "src", "a.txt"),
        path.join(dir, "sub", "b.txt"),
      ),
    ).toThrow("could not be put back");
  });

  it("moves to a name as long as the filesystem allows", () => {
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    const long = `${"n".repeat(251)}.txt`;
    renameIntoDirectory(path.join(dir, "a.txt"), path.join(dir, "sub", long));
    expect(fs.readFileSync(path.join(dir, "sub", long), "utf-8")).toBe("a");
  });

  it("names the source when it is missing", () => {
    expect(() =>
      renameIntoDirectory(path.join(dir, "gone.txt"), path.join(dir, "b.txt")),
    ).toThrow(path.join(dir, "gone.txt"));
  });
});

// Each test here runs on one device: the helper is what moveFile falls back
// to on EXDEV, and it never calls rename, so one device exercises it fully.
describe("moveFileAcrossDevices", () => {
  const fail = (code: string) =>
    ((...args: unknown[]) => {
      (args[args.length - 1] as (error: Error) => void)(errno(code));
    }) as never;

  it("copies the content, mode and times, then removes the source", async () => {
    const source = path.join(dir, "a.bin");
    const destination = path.join(outside, "b.bin");
    // More than one 64 KiB chunk.
    const content = Buffer.alloc(200 * 1024, 7);
    fs.writeFileSync(source, content);
    fs.chmodSync(source, 0o640);
    fs.utimesSync(source, new Date(1_000_000_000), new Date(1_000_000_000));
    await moveFileAcrossDevices(source, destination);
    expect(fs.readFileSync(destination).equals(content)).toBe(true);
    expect(fs.existsSync(source)).toBe(false);
    const moved = fs.statSync(destination);
    if (process.platform !== "win32") {
      expect(moved.mode & 0o777).toBe(0o640);
    }
    expect(moved.mtimeMs).toBe(1_000_000_000);
    expect(process.cwd()).toBe(cwd);
  });

  it.each([
    // 0.5 ms past a whole millisecond: a Date would drop it.
    ["below a millisecond", 1_000_000_000.1235],
    // Before 1970: futimes takes a negative number to mean "now".
    ["before 1970", new Date(-157_766_400_250)],
  ])("keeps the modification time %s", async (_, time) => {
    const source = path.join(dir, "a.txt");
    const destination = path.join(outside, "b.txt");
    fs.writeFileSync(source, "a");
    fs.utimesSync(source, time, time);
    const before = fs.statSync(source, { bigint: true }).mtimeNs;
    await moveFileAcrossDevices(source, destination);
    const after = fs.statSync(destination, { bigint: true }).mtimeNs;
    const drift = after > before ? after - before : before - after;
    expect(drift < 1000n).toBe(true);
  });

  it("moves an empty file", async () => {
    const source = path.join(dir, "empty");
    fs.writeFileSync(source, "");
    await moveFileAcrossDevices(source, path.join(outside, "empty"));
    expect(fs.readFileSync(path.join(outside, "empty"), "utf-8")).toBe("");
    expect(fs.existsSync(source)).toBe(false);
  });

  it("refuses a directory, and leaves it in place", async () => {
    const source = path.join(dir, "d");
    fs.mkdirSync(source);
    await expect(
      moveFileAcrossDevices(source, path.join(outside, "d")),
    ).rejects.toThrow(`Cannot move a directory across filesystems: ${source}.`);
    expect(fs.statSync(source).isDirectory()).toBe(true);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it.skipIf(!symlinks)(
    "refuses a symlink rather than following or recreating it",
    async () => {
      const target = path.join(dir, "t.txt");
      fs.writeFileSync(target, "t");
      const source = path.join(dir, "l.txt");
      fs.symlinkSync(target, source);
      await expect(
        moveFileAcrossDevices(source, path.join(outside, "l.txt")),
      ).rejects.toThrow(
        `Cannot move across filesystems: not a regular file: ${source}`,
      );
      expect(fs.lstatSync(source).isSymbolicLink()).toBe(true);
      expect(fs.readdirSync(outside)).toEqual([]);
    },
  );

  it("refuses an existing destination with EEXIST, and keeps both", async () => {
    const source = path.join(dir, "a.txt");
    const destination = path.join(outside, "b.txt");
    fs.writeFileSync(source, "a");
    fs.writeFileSync(destination, "b");
    await expect(moveFileAcrossDevices(source, destination)).rejects.toThrow(
      expect.objectContaining({ code: "EEXIST" }),
    );
    expect(fs.readFileSync(source, "utf-8")).toBe("a");
    expect(fs.readFileSync(destination, "utf-8")).toBe("b");
  });

  it.skipIf(!symlinks)(
    "refuses a destination directory that resolves somewhere else",
    async () => {
      fs.symlinkSync(outside, path.join(dir, "link"));
      const source = path.join(dir, "a.txt");
      fs.writeFileSync(source, "a");
      await expect(
        moveFileAcrossDevices(source, path.join(dir, "link", "b.txt")),
      ).rejects.toThrow("Access denied");
      expect(fs.readdirSync(outside)).toEqual([]);
      expect(fs.readFileSync(source, "utf-8")).toBe("a");
    },
  );

  it.each([
    ["another file", { ino: -1n }],
    ["not a regular file", { isFile: () => false }],
  ])(
    "refuses, and closes the source, when it was replaced while being opened (%s)",
    async (_, replaced) => {
      const source = path.join(dir, "a.txt");
      fs.writeFileSync(source, "a");
      const realFstat = fs.fstatSync;
      vi.spyOn(fs, "fstatSync").mockImplementationOnce(((
        fd: number,
        options?: fs.StatOptions,
      ) =>
        Object.assign(
          realFstat(fd, options),
          replaced,
        )) as typeof fs.fstatSync);
      const closeSync = vi.spyOn(fs, "closeSync");
      await expect(
        moveFileAcrossDevices(source, path.join(outside, "b.txt")),
      ).rejects.toThrow(
        `Refusing to move: ${source} was replaced while it was being opened`,
      );
      expect(closeSync).toHaveBeenCalled();
      expect(fs.readdirSync(outside)).toEqual([]);
    },
  );

  it.each(["read", "writeFile", "fchmod", "futimes"] as const)(
    "removes the partial copy, and keeps the source, when %s fails",
    async (step) => {
      const source = path.join(dir, "a.txt");
      fs.writeFileSync(source, "a");
      vi.spyOn(fs, step).mockImplementationOnce(fail("EIO"));
      await expect(
        moveFileAcrossDevices(source, path.join(outside, "b.txt")),
      ).rejects.toThrow("EIO");
      expect(fs.readdirSync(outside)).toEqual([]);
      expect(fs.readFileSync(source, "utf-8")).toBe("a");
    },
  );

  it.skipIf(process.platform === "win32")(
    "creates the copy owner-only while it is being written",
    async () => {
      const source = path.join(dir, "a.txt");
      const destination = path.join(outside, "b.txt");
      fs.writeFileSync(source, "a");
      fs.chmodSync(source, 0o644);
      const modes: number[] = [];
      const realWriteFile = fs.writeFile;
      vi.spyOn(fs, "writeFile").mockImplementationOnce(((
        ...args: unknown[]
      ) => {
        modes.push(fs.statSync(destination).mode & 0o777);
        return (realWriteFile as (...a: unknown[]) => void)(...args);
      }) as typeof fs.writeFile);
      await moveFileAcrossDevices(source, destination);
      expect(modes).toEqual([0o600]);
      expect(fs.statSync(destination).mode & 0o777).toBe(0o644);
    },
  );

  it.each([
    ["removed", (destination: string) => fs.unlinkSync(destination)],
    [
      "replaced",
      (destination: string) => {
        fs.unlinkSync(destination);
        fs.writeFileSync(destination, "someone else's");
      },
    ],
  ])(
    "keeps the source when the copy was %s during the move",
    async (_, interfere) => {
      const source = path.join(dir, "a.txt");
      const destination = path.join(outside, "b.txt");
      fs.writeFileSync(source, "a");
      const realFchmod = fs.fchmod;
      vi.spyOn(fs, "fchmod").mockImplementationOnce(((
        fd: number,
        mode: number,
        callback: (error: NodeJS.ErrnoException | null) => void,
      ) => {
        interfere(destination);
        realFchmod(fd, mode, callback);
      }) as typeof fs.fchmod);
      await expect(moveFileAcrossDevices(source, destination)).rejects.toThrow(
        `Refusing to remove the source: ${destination} was removed or replaced during the move`,
      );
      expect(fs.readFileSync(source, "utf-8")).toBe("a");
    },
  );

  it("reports a failure to check the copy, and keeps the source", async () => {
    const source = path.join(dir, "a.txt");
    const destination = path.join(outside, "b.txt");
    fs.writeFileSync(source, "a");
    const realLstat = fs.lstatSync;
    // The first lstat of the copy is the create's own check; fail the second.
    let checks = 0;
    vi.spyOn(fs, "lstatSync").mockImplementation(((
      p: fs.PathLike,
      options?: fs.StatSyncOptions,
    ) => {
      if (process.cwd() === outside && p === "b.txt" && ++checks === 2) {
        throw errno("EIO");
      }
      return realLstat(p, options);
    }) as typeof fs.lstatSync);
    await expect(moveFileAcrossDevices(source, destination)).rejects.toThrow(
      "EIO",
    );
    // The third is discarding the copy, which goes ahead.
    expect(checks).toBe(3);
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(fs.readFileSync(source, "utf-8")).toBe("a");
  });

  it("removes the copy, and keeps the source, when closing the source fails", async () => {
    const source = path.join(dir, "a.txt");
    fs.writeFileSync(source, "a");
    const realClose = fs.close;
    let closes = 0;
    vi.spyOn(fs, "close").mockImplementation(((
      fd: number,
      callback: (error: NodeJS.ErrnoException | null) => void,
    ) => {
      // The copy's descriptor closes first, then the source's.
      closes += 1;
      realClose(fd, (error) => callback(closes === 2 ? errno("EIO") : error));
    }) as typeof fs.close);
    await expect(
      moveFileAcrossDevices(source, path.join(outside, "b.txt")),
    ).rejects.toThrow("EIO");
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(fs.readFileSync(source, "utf-8")).toBe("a");
  });

  it("checks the copy against its identity after the write, where Windows compares size and time", async () => {
    // libuv < 1.51 on Windows reports dev 0 on a path stat, so isSameEntry
    // compares size and mtime there: the identity from the create (empty)
    // would no longer match the finished copy.
    Object.defineProperty(process, "platform", { value: "win32" });
    const realLstat = fs.lstatSync;
    vi.spyOn(fs, "lstatSync").mockImplementation(((
      p: fs.PathLike,
      options?: fs.StatSyncOptions,
    ) => {
      const stats = realLstat(p, options);
      return options?.bigint ? Object.assign(stats!, { dev: 0n }) : stats;
    }) as typeof fs.lstatSync);
    const source = path.join(dir, "a.txt");
    const destination = path.join(outside, "b.txt");
    fs.writeFileSync(source, "content");
    await moveFileAcrossDevices(source, destination);
    expect(fs.readFileSync(destination, "utf-8")).toBe("content");
    expect(fs.existsSync(source)).toBe(false);
  });

  it("falls back to the create's identity when the copy cannot be stat'd before closing", async () => {
    const source = path.join(dir, "a.txt");
    const destination = path.join(outside, "b.txt");
    fs.writeFileSync(source, "a");
    const realFstat = fs.fstatSync;
    // The source's open and the copy's create stat first; fail the third.
    let calls = 0;
    vi.spyOn(fs, "fstatSync").mockImplementation(((
      fd: number,
      options?: fs.StatOptions,
    ) => {
      if (++calls === 3) {
        throw errno("EIO");
      }
      return realFstat(fd, options);
    }) as typeof fs.fstatSync);
    await moveFileAcrossDevices(source, destination);
    expect(calls).toBe(3);
    expect(fs.readFileSync(destination, "utf-8")).toBe("a");
    expect(fs.existsSync(source)).toBe(false);
  });

  it("removes the copy, and keeps the source, when the source was written to in place during the move", async () => {
    const source = path.join(dir, "a.txt");
    const destination = path.join(outside, "b.txt");
    fs.writeFileSync(source, "a");
    const before = fs.lstatSync(source).ino;
    const realFchmod = fs.fchmod;
    // fchmod runs once the copy has read to the end of the source.
    vi.spyOn(fs, "fchmod").mockImplementationOnce(((
      fd: number,
      mode: number,
      callback: (error: NodeJS.ErrnoException | null) => void,
    ) => {
      fs.appendFileSync(source, " and more");
      realFchmod(fd, mode, callback);
    }) as typeof fs.fchmod);
    await expect(moveFileAcrossDevices(source, destination)).rejects.toThrow(
      `Refusing to remove: ${source} changed during the move`,
    );
    expect(fs.lstatSync(source).ino).toBe(before);
    expect(fs.readFileSync(source, "utf-8")).toBe("a and more");
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it("reports the copy's failure when removing the copy fails too", async () => {
    const source = path.join(dir, "a.txt");
    fs.writeFileSync(source, "a");
    vi.spyOn(fs, "read").mockImplementationOnce(fail("EIO"));
    vi.spyOn(fs, "unlinkSync").mockImplementationOnce(() => {
      throw errno("EBUSY");
    });
    await expect(
      moveFileAcrossDevices(source, path.join(outside, "b.txt")),
    ).rejects.toThrow("EIO");
    expect(fs.readFileSync(source, "utf-8")).toBe("a");
  });

  it("removes the copy, and keeps the source, when the source cannot be removed", async () => {
    const source = path.join(dir, "a.txt");
    fs.writeFileSync(source, "a");
    const realUnlink = fs.unlinkSync;
    vi.spyOn(fs, "unlinkSync")
      .mockImplementationOnce(() => {
        throw errno("EACCES");
      })
      .mockImplementation(realUnlink);
    await expect(
      moveFileAcrossDevices(source, path.join(outside, "b.txt")),
    ).rejects.toThrow("EACCES");
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(fs.readFileSync(source, "utf-8")).toBe("a");
  });

  it("removes the copy, and leaves the new file, when the source was replaced during the copy", async () => {
    const source = path.join(dir, "a.txt");
    fs.writeFileSync(source, "a");
    const realFchmod = fs.fchmod;
    vi.spyOn(fs, "fchmod").mockImplementationOnce(((
      fd: number,
      mode: number,
      callback: (error: NodeJS.ErrnoException | null) => void,
    ) => {
      fs.unlinkSync(source);
      fs.writeFileSync(source, "replacement");
      realFchmod(fd, mode, callback);
    }) as typeof fs.fchmod);
    await expect(
      moveFileAcrossDevices(source, path.join(outside, "b.txt")),
    ).rejects.toThrow(
      `Refusing to remove: ${source} was replaced during the move`,
    );
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(fs.readFileSync(source, "utf-8")).toBe("replacement");
  });
});

describe("createDirectoryInPlace", () => {
  it("creates missing parents, and restores the working directory", () => {
    createDirectoryInPlace(path.join(dir, "a", "b", "c"));
    expect(fs.statSync(path.join(dir, "a", "b", "c")).isDirectory()).toBe(true);
    expect(process.cwd()).toBe(cwd);
  });

  it("succeeds on an existing directory", () => {
    expect(() => createDirectoryInPlace(dir)).not.toThrow();
  });

  it("fails with EEXIST on a file in the way, at the end or on the way", () => {
    fs.writeFileSync(path.join(dir, "file"), "");
    expect(() => createDirectoryInPlace(path.join(dir, "file"))).toThrow(
      expect.objectContaining({ code: "EEXIST" }),
    );
    expect(() =>
      createDirectoryInPlace(path.join(dir, "file", "below")),
    ).toThrow(expect.objectContaining({ code: "EEXIST" }));
  });

  it("fails with EEXIST when chdir reports a file in the way as ENOENT (Windows)", () => {
    fs.writeFileSync(path.join(dir, "file"), "");
    const realChdir = process.chdir.bind(process);
    vi.spyOn(process, "chdir").mockImplementation((directory) => {
      if (directory === "file") {
        throw Object.assign(new Error("ENOENT: no such file or directory"), {
          code: "ENOENT",
        });
      }
      realChdir(directory);
    });
    expect(() => createDirectoryInPlace(path.join(dir, "file"))).toThrow(
      expect.objectContaining({ code: "EEXIST" }),
    );
  });

  it.skipIf(!symlinks)("refuses a parent that resolves somewhere else", () => {
    fs.symlinkSync(outside, path.join(dir, "link"));
    expect(() =>
      createDirectoryInPlace(path.join(dir, "link", "a", "b")),
    ).toThrow("Access denied");
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it("steps down into a name the volume stored decomposed (HFS+)", () => {
    // Stand in for HFS+, which stores the NFC name mkdir is given as NFD.
    const nfc = "caf\u00e9";
    const nfd = "cafe\u0301";
    const realCwd = process.cwd.bind(process);
    vi.spyOn(process, "cwd").mockImplementation(() =>
      realCwd().split(nfc).join(nfd),
    );
    createDirectoryInPlace(path.join(dir, nfc, "sub"));
    vi.restoreAllMocks();
    expect(fs.statSync(path.join(dir, nfc, "sub")).isDirectory()).toBe(true);
  });

  // Windows skips the getcwd check by design; the test below covers that path.
  it.skipIf(process.platform === "win32")(
    "refuses a step down that lands outside the anchor",
    () => {
      const realChdir = process.chdir.bind(process);
      vi.spyOn(process, "chdir").mockImplementation((directory) => {
        realChdir(directory === "a" ? outside : directory);
      });
      expect(() => createDirectoryInPlace(path.join(dir, "a"))).toThrow(
        "Access denied",
      );
    },
  );

  it("steps down without the getcwd check on Windows", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    createDirectoryInPlace(path.join(dir, "w", "x"));
    expect(fs.statSync(path.join(dir, "w", "x")).isDirectory()).toBe(true);
  });

  it.skipIf(process.platform !== "darwin")(
    "creates a directory with a precomposed name on a real HFS+ volume",
    ({ skip }) => {
      const image = path.join(outside, "hfs.dmg");
      const mount = path.join(outside, "mnt");
      fs.mkdirSync(mount);
      try {
        execFileSync("hdiutil", [
          "create",
          "-size",
          "4m",
          "-fs",
          "HFS+",
          "-volname",
          "T",
          "-quiet",
          image,
        ]);
        execFileSync("hdiutil", [
          "attach",
          image,
          "-nobrowse",
          "-mountpoint",
          mount,
          "-quiet",
        ]);
      } catch {
        skip();
      }
      try {
        const target = path.join(fs.realpathSync(mount), "caf\u00e9", "sub");
        createDirectoryInPlace(target);
        expect(fs.statSync(target).isDirectory()).toBe(true);
      } finally {
        process.chdir(cwd);
        execFileSync("hdiutil", ["detach", mount, "-quiet"]);
      }
    },
    // hdiutil create, attach and detach together take about 1.5 s on an idle
    // machine and can pass vitest's 5 s default under load (#5314). A
    // timeout sized for them, never a retry, which would hide a real failure.
    30_000,
  );

  it("reports a failure to enter a directory other than a missing one as is", () => {
    const target = path.join(dir, "a");
    const realChdir = process.chdir.bind(process);
    vi.spyOn(process, "chdir").mockImplementation((directory) => {
      if (directory === target) throw errno("EACCES");
      realChdir(directory);
    });
    expect(() => createDirectoryInPlace(target)).toThrow("EACCES");
  });

  it("reports a failure to enter a directory it just created as is", () => {
    // The step down enters the new directory by its name, relative.
    const realChdir = process.chdir.bind(process);
    vi.spyOn(process, "chdir").mockImplementation((directory) => {
      if (directory === "a") throw errno("EACCES");
      realChdir(directory);
    });
    expect(() => createDirectoryInPlace(path.join(dir, "a"))).toThrow("EACCES");
  });

  it("reports a mkdir failure other than EEXIST as is", () => {
    vi.spyOn(fs, "mkdirSync").mockImplementationOnce(() => {
      throw errno("EACCES");
    });
    expect(() => createDirectoryInPlace(path.join(dir, "a"))).toThrow("EACCES");
  });
});

describe("the borrowed working directory", () => {
  it("returns to the filesystem root when the previous one cannot be read", async () => {
    vi.spyOn(process, "cwd")
      .mockImplementationOnce(() => {
        throw errno("ENOENT");
      })
      .mockImplementation(() => fs.realpathSync.native("."));
    const chdir = vi.spyOn(process, "chdir");
    await createFileInDirectory(path.join(dir, "x.txt"), "x");
    expect(chdir).toHaveBeenLastCalledWith(path.parse(dir).root);
  });

  it("returns to the filesystem root when the previous one is gone", async () => {
    const realChdir = process.chdir.bind(process);
    vi.spyOn(process, "chdir").mockImplementation((directory) => {
      if (directory === cwd) throw errno("ENOENT");
      realChdir(directory);
    });
    await createFileInDirectory(path.join(dir, "x.txt"), "x");
    expect(fs.realpathSync(".")).toBe(fs.realpathSync(path.parse(dir).root));
  });
});

describe("the anchored reads", () => {
  it("reads a whole file and restores the working directory", async () => {
    const file = path.join(dir, "r.txt");
    fs.writeFileSync(file, "content");
    expect((await readFileInDirectory(file)).toString()).toBe("content");
    expect(process.cwd()).toBe(cwd);
  });

  it("reads at a position through the opened file, which knows its size", async () => {
    const file = path.join(dir, "r.txt");
    fs.writeFileSync(file, "0123456789");
    const handle = await openFileForReading(file);
    try {
      expect(handle.size).toBe(10);
      const buffer = Buffer.alloc(3);
      expect(await handle.read(buffer, 0, 3, 4)).toEqual({ bytesRead: 3 });
      expect(buffer.toString()).toBe("456");
    } finally {
      await handle.close();
    }
  });

  it("reports a read failure, and closes the file", async () => {
    const file = path.join(dir, "r.txt");
    fs.writeFileSync(file, "content");
    vi.spyOn(fs, "readFile").mockImplementationOnce(((
      _fd: number,
      callback: (error: Error) => void,
    ) => callback(errno("EIO"))) as typeof fs.readFile);
    const close = vi.spyOn(fs, "close");
    await expect(readFileInDirectory(file)).rejects.toThrow("EIO");
    expect(close).toHaveBeenCalled();
  });

  it("reports a positioned read failure", async () => {
    const file = path.join(dir, "r.txt");
    fs.writeFileSync(file, "content");
    const handle = await openFileForReading(file);
    vi.spyOn(fs, "read").mockImplementationOnce(((...args: unknown[]) => {
      (args[args.length - 1] as (error: Error) => void)(errno("EIO"));
    }) as typeof fs.read);
    try {
      await expect(handle.read(Buffer.alloc(1), 0, 1, 0)).rejects.toThrow(
        "EIO",
      );
    } finally {
      await handle.close();
    }
  });

  it("refuses a file other than the one lstat saw, and closes it", async () => {
    const file = path.join(dir, "r.txt");
    fs.writeFileSync(file, "content");
    const realLstat = fs.lstatSync;
    vi.spyOn(fs, "lstatSync").mockImplementationOnce((p) => ({
      ...realLstat(p, { bigint: true }),
      isDirectory: () => false,
      isFile: () => true,
      ino: -1n,
    }));
    const closeSync = vi.spyOn(fs, "closeSync");
    await expect(readFileInDirectory(file)).rejects.toThrow(
      `Refusing to read: ${file} was replaced while it was being opened`,
    );
    expect(closeSync).toHaveBeenCalled();
  });

  it.skipIf(!symlinks)(
    "refuses a directory that resolves somewhere else",
    async () => {
      fs.writeFileSync(path.join(outside, "s.txt"), "SECRET");
      fs.symlinkSync(outside, path.join(dir, "link"));
      await expect(
        readFileInDirectory(path.join(dir, "link", "s.txt")),
      ).rejects.toThrow(
        "Access denied - a directory on the path changed during the operation",
      );
      expect(() => statInDirectory(path.join(dir, "link", "s.txt"))).toThrow(
        "Access denied - a directory on the path changed during the operation",
      );
    },
  );

  it("stats the entry in its directory, and a filesystem root as is", () => {
    const file = path.join(dir, "r.txt");
    fs.writeFileSync(file, "content");
    expect(statInDirectory(file).size).toBe(7);
    const root = path.parse(dir).root;
    expect(statInDirectory(root).isDirectory()).toBe(true);
    expect(process.cwd()).toBe(cwd);
  });

  it("stats a UNC share root directly on Windows, as it does any root", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const stats = fs.lstatSync(dir);
    const lstat = vi.spyOn(fs, "lstatSync").mockReturnValue(stats);
    const chdir = vi.spyOn(process, "chdir");
    for (const root of ["\\\\server\\share", "\\\\?\\UNC\\server\\share\\"]) {
      expect(statInDirectory(root)).toBe(stats);
      expect(lstat).toHaveBeenLastCalledWith(root);
    }
    expect(chdir).not.toHaveBeenCalled();
  });
});
