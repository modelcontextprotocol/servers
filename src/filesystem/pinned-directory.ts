// Write operations anchored to their directory, so a directory swapped out
// from under them cannot redirect them.
//
// validatePath() checks a path and returns its canonical form, but the write
// that follows resolves that path again. A directory on it swapped for a
// symlink in between would redirect the write outside the allowed directories,
// because the kernel follows the symlink at use. Checking again afterwards
// cannot close that (the racer swaps back in time), and openat() is not in
// Node. The substitute here: chdir() into the directory, read back where the
// process really is (getcwd() reports the directory the kernel entered, not
// the string it was given), refuse unless that is the validated directory,
// and only then act on the final component relative to it. The working
// directory holds the directory's inode, so swapping the path afterwards
// cannot move the operation. Every check happens before a byte is written,
// so nothing ever needs rolling back.
//
// On Windows the working directory is a string and relative paths resolve
// against it, so reading it back proves nothing; there the leaf is lstat'd
// relative to the anchor and must be the file the descriptor opened, which
// narrows the race without closing it.

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

// O_NOFOLLOW is undefined on Windows; the lstat checks below stand in there.
function noFollow(): number {
  return fs.constants.O_NOFOLLOW ?? 0;
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

// The macOS Data volume, which firmlinks /Users, /private and the rest into
// the root: realpath keeps a /System/Volumes/Data/... spelling it is given,
// while getcwd reports the firmlinked one.
const DATA_VOLUME = "/System/Volumes/Data";

function withoutDataVolume(directory: string): string {
  return directory.startsWith(`${DATA_VOLUME}/`)
    ? directory.slice(DATA_VOLUME.length)
    : directory;
}

/**
 * Whether `cwd`, as getcwd() reports it, is `directory`, the validated
 * directory in its on-disk spelling (validatePath builds it from realpath and
 * readdir results).
 *
 * Exact, byte for byte, on every platform: a filesystem that compares names
 * byte for byte can hold an NFC and an NFD twin side by side (Linux, and an
 * NFS mount of one on macOS, where mount_nfs folds only when asked to), so
 * any normalization fold would accept the twin. The one fold is macOS's Data
 * volume: /System/Volumes/Data/<x> and the firmlinked /<x> name the same
 * directory, and the root of the sealed, read-only system volume cannot hold
 * a directory of the attacker's making, so folding that prefix away cannot
 * admit one.
 */
export function isSameDirectory(
  cwd: string,
  directory: string,
  platform: string = process.platform,
): boolean {
  if (platform !== "darwin") {
    return cwd === directory;
  }
  return withoutDataVolume(cwd) === withoutDataVolume(directory);
}

/**
 * Whether `cwd` is the directory `name` inside `parent`, entered by a
 * relative chdir(name) from `parent`, the anchor already verified. The parent
 * compares exactly (isSameDirectory); the last component compares in NFC,
 * because a volume may store the name mkdir was given decomposed (HFS+). A
 * relative chdir resolves against the verified anchor, so the most a fold
 * there can admit is a twin inside that same directory.
 */
export function isChildDirectory(
  cwd: string,
  parent: string,
  name: string,
  platform: string = process.platform,
): boolean {
  return (
    isSameDirectory(path.dirname(cwd), parent, platform) &&
    path.basename(cwd).normalize("NFC") === name.normalize("NFC")
  );
}

/**
 * Check that the process is in `directory`. getcwd() is computed from the
 * directory actually entered, so this holds only if no directory on the path
 * was swapped before the chdir.
 */
function verifyWorkingDirectory(directory: string): void {
  if (!onWindows() && !isSameDirectory(process.cwd(), directory)) {
    throw directoryChangedError(directory);
  }
}

function enterDirectory(directory: string): void {
  process.chdir(directory);
  verifyWorkingDirectory(directory);
}

/**
 * Run `action` with the working directory anchored at `directory`, and
 * restore the previous working directory afterwards.
 *
 * ⚠️ The cwd invariant, load-bearing: `action` must be synchronous, and so is
 * everything here between the chdir and the chdir back. The working directory
 * is process-wide; because no await happens while it is borrowed, no other
 * JavaScript in the process (another request, a path.resolve() of a relative
 * path) ever runs while it is, so no lock is needed and nothing else can see
 * it. Only what is done to an anchor-relative path inside `action` uses it;
 * every other path the server hands to fs is absolute.
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
 * Open the final component of `filePath` relative to its anchored directory.
 * Afterwards the anchor must still hold, at that name, the file the descriptor
 * opened (the check that matters on Windows, where `refuseLink` also refuses a
 * symlink or reparse point there before the open).
 */
function openInDirectory(
  filePath: string,
  flags: number,
  refuseLink: boolean,
): { fd: number; opened: fs.Stats } {
  const name = path.basename(filePath);
  return inDirectory(path.dirname(filePath), () => {
    if (refuseLink && fs.lstatSync(name).isSymbolicLink()) {
      throw new Error(`Refusing to write: not a regular file: ${filePath}`);
    }
    const fd = fs.openSync(name, flags, 0o666);
    try {
      const opened = fs.fstatSync(fd);
      if (!isSameEntry(fs.lstatSync(name), opened)) {
        throw directoryChangedError(path.dirname(filePath));
      }
      return { fd, opened };
    } catch (error) {
      fs.closeSync(fd);
      throw error;
    }
  });
}

/** Create `filePath`, which must not exist, and write `content` to it. */
export async function createFileInDirectory(
  filePath: string,
  content: string,
): Promise<void> {
  // O_EXCL: an existing file or symlink fails with EEXIST, never followed.
  const { fd } = openInDirectory(
    filePath,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      noFollow(),
    false,
  );
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
  // on a symlink; no O_TRUNC, so nothing changes before the checks pass.
  const { fd, opened } = openInDirectory(
    filePath,
    fs.constants.O_RDWR | noFollow(),
    onWindows(),
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

/**
 * Rename `sourcePath` (absolute, outside this fix's scope) to the final
 * component of `destinationPath`, relative to its anchored directory.
 */
export function renameIntoDirectory(
  sourcePath: string,
  destinationPath: string,
): void {
  inDirectory(path.dirname(destinationPath), () =>
    fs.renameSync(sourcePath, path.basename(destinationPath)),
  );
}

/**
 * Create `directory` and any missing parents, like mkdir -p: anchor at the
 * deepest ancestor that exists, then step down one component at a time,
 * creating it relative to the anchor, entering it relative to the anchor, and
 * checking where the process landed. Anything other than a directory in the
 * way fails with EEXIST, as mkdir -p reports it.
 */
export function createDirectoryInPlace(directory: string): void {
  const root = path.parse(directory).root;
  inDirectory(root, () => {
    const missing: string[] = [];
    let current = directory;
    for (;;) {
      try {
        enterDirectory(current);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTDIR") {
          throw error;
        }
      }
      missing.unshift(path.basename(current));
      current = path.dirname(current);
    }
    for (const name of missing) {
      let inTheWay: unknown;
      try {
        fs.mkdirSync(name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
        inTheWay = error;
      }
      try {
        process.chdir(name);
      } catch (error) {
        // A file in the way: POSIX reports ENOTDIR, Windows ENOENT.
        const code = (error as NodeJS.ErrnoException).code;
        if (inTheWay && (code === "ENOTDIR" || code === "ENOENT")) {
          throw inTheWay;
        }
        throw error;
      }
      if (!onWindows()) {
        const entered = process.cwd();
        if (!isChildDirectory(entered, current, name)) {
          throw directoryChangedError(path.join(current, name));
        }
        // The next step's parent, in the spelling the volume stored.
        current = entered;
      } else {
        current = path.join(current, name);
      }
    }
  });
}
