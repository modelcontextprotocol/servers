// Write operations whose directory cannot be swapped out from under them.
//
// validatePath() checks a path and returns its canonical form, but the write
// that follows resolves that path again. A directory on it swapped for a
// symlink in between would redirect the write outside the allowed directories,
// because the kernel follows the symlink at use. Closing that needs openat(),
// which Node does not have. The substitute here: chdir() into the directory,
// read back where the process really is (getcwd() reports the directory the
// kernel entered, not the string it was given), and only then act on the
// final component relative to it. The working directory holds the directory's
// inode, so a later swap of the path cannot move the operation. Every step
// between the chdir and the chdir back is synchronous, so no other code in the
// process runs while the working directory is borrowed.
//
// On Windows the working directory is a string, so reading it back proves
// nothing; there the opened file is compared with what the path holds after
// the open, which narrows the race without closing it.

import fs from "fs";
import path from "path";

// Descriptor I/O, looked up on fs at call time so tests can stand in for it.
function ftruncate(fd: number): Promise<void> {
  return new Promise((resolve, reject) =>
    fs.ftruncate(fd, 0, (error) => (error ? reject(error) : resolve())),
  );
}

function writeAll(fd: number, content: string): Promise<void> {
  return new Promise((resolve, reject) =>
    fs.writeFile(fd, content, "utf-8", (error) =>
      error ? reject(error) : resolve(),
    ),
  );
}

function close(fd: number): Promise<void> {
  return new Promise((resolve, reject) =>
    fs.close(fd, (error) => (error ? reject(error) : resolve())),
  );
}

// Read at call time, so tests can stand in for another platform.
function onWindows(): boolean {
  return process.platform === "win32";
}

function directoryChangedError(directory: string): Error {
  return new Error(
    `Access denied - a directory on the path changed during the operation: ${directory}`,
  );
}

function isSameEntry(
  left: { dev: number; ino: number },
  right: { dev: number; ino: number },
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function enterDirectory(directory: string): void {
  process.chdir(directory);
  if (!onWindows() && process.cwd() !== directory) {
    throw directoryChangedError(directory);
  }
}

/**
 * Run `action` with the working directory set to `directory`, once the
 * directory actually entered is checked to be that one, and restore the
 * working directory afterwards. `action` must be synchronous.
 */
function inDirectory<T>(directory: string, action: () => T): T {
  let previous: string | undefined;
  try {
    previous = process.cwd();
  } catch {
    // The working directory was removed; there is nothing to return to.
  }
  try {
    enterDirectory(directory);
    return action();
  } finally {
    try {
      process.chdir(previous ?? path.parse(directory).root);
    } catch {
      process.chdir(path.parse(directory).root);
    }
  }
}

/**
 * Open the final component of `filePath` relative to its pinned directory,
 * and check that the path still holds the opened file (the only check that
 * means anything on Windows).
 */
function openInDirectory(
  filePath: string,
  flags: number | string,
): { fd: number; opened: fs.Stats } {
  const fd = inDirectory(path.dirname(filePath), () =>
    fs.openSync(path.basename(filePath), flags),
  );
  try {
    const opened = fs.fstatSync(fd);
    if (!isSameEntry(fs.lstatSync(filePath), opened)) {
      throw directoryChangedError(path.dirname(filePath));
    }
    return { fd, opened };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

/** Create `filePath`, which must not exist, and write `content` to it. */
export async function createFileInDirectory(
  filePath: string,
  content: string,
): Promise<void> {
  // 'wx': exclusive creation, so an existing file or symlink fails with EEXIST.
  const { fd } = openInDirectory(filePath, "wx");
  try {
    await writeAll(fd, content);
  } finally {
    await close(fd);
  }
}

/**
 * Replace the content of the regular file at `filePath`, which must be the
 * file `expected` describes, through a single descriptor.
 */
export async function overwriteFileInDirectory(
  filePath: string,
  content: string,
  expected: { dev: number; ino: number },
): Promise<void> {
  // O_RDWR rather than O_WRONLY: opening a FIFO swapped in for writing only
  // would block until a reader arrives. O_NOFOLLOW fails the open with ELOOP
  // on a symlink; it does not exist on Windows.
  const { fd, opened } = openInDirectory(
    filePath,
    fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    if (!opened.isFile() || !isSameEntry(opened, expected)) {
      throw new Error(
        `Refusing to write: ${filePath} was replaced while it was being opened`,
      );
    }
    await ftruncate(fd);
    await writeAll(fd, content);
  } finally {
    await close(fd);
  }
}

/** Rename `sourcePath` to `destinationPath`, within its pinned directory. */
export function renameIntoDirectory(
  sourcePath: string,
  destinationPath: string,
): void {
  inDirectory(path.dirname(destinationPath), () =>
    fs.renameSync(sourcePath, path.basename(destinationPath)),
  );
}

/**
 * Leave the working directory in `directory`, creating it and any missing
 * parents first, each inside its pinned parent. Anything other than a
 * directory in the way fails with EEXIST, as mkdir -p reports it.
 */
function enterOrCreateDirectory(directory: string): void {
  try {
    enterDirectory(directory);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      throw error;
    }
  }
  const parent = path.dirname(directory);
  /* v8 ignore next 3 -- the filesystem root always exists, and validatePath only returns paths below an existing allowed directory */
  if (parent === directory) {
    throw new Error(`Cannot create directory: ${directory}`);
  }
  enterOrCreateDirectory(parent);
  let inTheWay: unknown;
  try {
    fs.mkdirSync(path.basename(directory));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
    inTheWay = error;
  }
  try {
    enterDirectory(directory);
  } catch (error) {
    if (inTheWay && (error as NodeJS.ErrnoException).code === "ENOTDIR") {
      throw inTheWay;
    }
    throw error;
  }
}

/** Create `directory` and any missing parents, like mkdir -p. */
export function createDirectoryInPlace(directory: string): void {
  inDirectory(path.parse(directory).root, () =>
    enterOrCreateDirectory(directory),
  );
}
