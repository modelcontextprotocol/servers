// Unit tests for pinned-directory.ts, on the real filesystem. The protocol-level
// tests in server-tools.test.ts stage the directory swaps an attacker would
// race; these cover each helper's own contract and failure paths, including
// the Windows branch (stood in for by setting process.platform) and the
// working-directory bookkeeping a borrowed chdir needs.

import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDirectoryInPlace,
  createFileInDirectory,
  overwriteFileInDirectory,
  renameIntoDirectory,
} from "../pinned-directory.js";
import { makeTempDir } from "./helpers.js";

const symlinks = process.platform !== "win32";
const realPlatform = process.platform;
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
      ...realLstat(p),
      ino: -1,
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
        ...realLstat(p),
        ino: -1,
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
    const expected = fs.lstatSync(file);
    await overwriteFileInDirectory(file, "short", expected);
    expect(fs.readFileSync(file, "utf-8")).toBe("short");
    expect(fs.lstatSync(file).ino).toBe(expected.ino);
  });

  it("refuses a file other than the one expected", async () => {
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "original");
    const expected = { ...fs.lstatSync(file), ino: -1 };
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
    const expected = fs.lstatSync(file);
    const realFstat = fs.fstatSync;
    vi.spyOn(fs, "fstatSync").mockImplementationOnce((fd) => {
      const stats = realFstat(fd);
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
      overwriteFileInDirectory(file, "new", fs.lstatSync(file)),
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
      overwriteFileInDirectory(link, "pwned", fs.statSync(target)),
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
        overwriteFileInDirectory(link, "pwned", fs.statSync(target)),
      ).rejects.toThrow(`Refusing to write: not a regular file: ${link}`);
      expect(fs.readFileSync(target, "utf-8")).toBe("SECRET");
    },
  );

  it("overwrites a regular file", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "original");
    await overwriteFileInDirectory(file, "new", fs.lstatSync(file));
    expect(fs.readFileSync(file, "utf-8")).toBe("new");
  });
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

  it.skipIf(!symlinks)("refuses a parent that resolves somewhere else", () => {
    fs.symlinkSync(outside, path.join(dir, "link"));
    expect(() =>
      createDirectoryInPlace(path.join(dir, "link", "a", "b")),
    ).toThrow("Access denied");
    expect(fs.readdirSync(outside)).toEqual([]);
  });

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
