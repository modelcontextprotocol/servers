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
// so nothing ever needs rolling back, except in the cross-device move, which
// copies and so removes its copy if a later step fails.
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

/** What the identity check reads from a stat (always a BigInt stat). */
type EntryIdentity = Pick<fs.BigIntStats, "dev" | "ino" | "size" | "mtimeNs">;

/**
 * Whether `pathStat` (an lstat of the path) and `handleStat` (an fstat of the
 * opened descriptor) describe the same file (#5154).
 *
 * Both are BigInt stats, so `ino` compares exactly: a number stat's `ino` is
 * a double, and NTFS file ids above 2^53 round in it, so two different files
 * could compare equal.
 *
 * Normally the file is the same when device and inode both match. On Windows
 * with libuv < 1.51.0 (the Node 23 line), a path-based stat reports `dev` 0
 * while the handle reports the volume serial, so comparing devices would
 * refuse every overwrite. There a 0n device on the path stat is treated as
 * unknown rather than as a match: the file must then agree on inode, size and
 * modification time (in nanoseconds), and any difference refuses. It never
 * skips the check; a stale or changed size or time fails closed.
 */
function isSameEntry(
  pathStat: EntryIdentity,
  handleStat: EntryIdentity,
): boolean {
  if (pathStat.ino !== handleStat.ino) {
    return false;
  }
  if (onWindows() && pathStat.dev === 0n) {
    return (
      pathStat.size === handleStat.size &&
      pathStat.mtimeNs === handleStat.mtimeNs
    );
  }
  return pathStat.dev === handleStat.dev;
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
  mode: number = 0o666,
): { fd: number; opened: fs.BigIntStats } {
  const name = path.basename(filePath);
  return inDirectory(path.dirname(filePath), () => {
    if (refuseLink && fs.lstatSync(name).isSymbolicLink()) {
      throw new Error(`Refusing to write: not a regular file: ${filePath}`);
    }
    const fd = fs.openSync(name, flags, mode);
    try {
      const opened = fs.fstatSync(fd, { bigint: true });
      if (!isSameEntry(fs.lstatSync(name, { bigint: true }), opened)) {
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
 * file `expected` (its BigInt lstat) describes, through a single descriptor.
 */
export async function overwriteFileInDirectory(
  filePath: string,
  content: string,
  expected: EntryIdentity,
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
    if (!opened.isFile() || !isSameEntry(expected, opened)) {
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

// The cross-device move below (#5188). rename() cannot cross a device
// boundary, so a move between allowed directories on different mounts copies
// the file and then removes the source. Every name it touches is opened,
// created or removed relative to its anchored directory, like the writes
// above, and checked to be the entry it expects.

// Read without following a symlink, and without blocking on a FIFO swapped
// in after the lstat (a regular file ignores O_NONBLOCK). Both are undefined
// on Windows, where the lstat identity checks stand in.
function readFlags(): number {
  return fs.constants.O_RDONLY | noFollow() | (fs.constants.O_NONBLOCK ?? 0);
}

function readChunk(fd: number, buffer: Buffer): Promise<number> {
  return new Promise((resolve, reject) =>
    fs.read(fd, buffer, 0, buffer.length, null, (error, bytesRead) =>
      error ? reject(error) : resolve(bytesRead),
    ),
  );
}

function writeChunk(fd: number, chunk: Buffer): Promise<void> {
  return new Promise((resolve, reject) =>
    fs.writeFile(fd, chunk, (error) => (error ? reject(error) : resolve())),
  );
}

// A numeric string, since fs.futimes takes a negative number to mean "now",
// which would lose a time before 1970; a string it parses as given.
function seconds(nanoseconds: bigint): string {
  return String(Number(nanoseconds) / 1e9);
}

function keepModeAndTimes(fd: number, source: fs.BigIntStats): Promise<void> {
  return new Promise((resolve, reject) =>
    fs.fchmod(fd, Number(source.mode & 0o777n), (chmodError) =>
      chmodError
        ? reject(chmodError)
        : // In seconds from the nanosecond fields: a Date keeps only
          // milliseconds.
          fs.futimes(
            fd,
            seconds(source.atimeNs),
            seconds(source.mtimeNs),
            (timesError) => (timesError ? reject(timesError) : resolve()),
          ),
    ),
  );
}

/**
 * Open the regular file at `sourcePath` for reading, relative to its anchored
 * directory. A directory, a symlink or anything else that is not a regular
 * file is refused: a symlink is not followed or recreated, since its target
 * could name anything, and a directory is not copied recursively.
 */
function openSourceInDirectory(sourcePath: string): {
  fd: number;
  opened: fs.BigIntStats;
} {
  const name = path.basename(sourcePath);
  return inDirectory(path.dirname(sourcePath), () => {
    const found = fs.lstatSync(name, { bigint: true });
    if (found.isDirectory()) {
      throw new Error(
        `Cannot move a directory across filesystems: ${sourcePath}. ` +
          "Create the directory at the destination and move its files one at a time.",
      );
    }
    if (!found.isFile()) {
      throw new Error(
        `Cannot move across filesystems: not a regular file: ${sourcePath}`,
      );
    }
    const fd = fs.openSync(name, readFlags());
    try {
      const opened = fs.fstatSync(fd, { bigint: true });
      if (!opened.isFile() || !isSameEntry(found, opened)) {
        throw new Error(
          `Refusing to move: ${sourcePath} was replaced while it was being opened`,
        );
      }
      return { fd, opened };
    } catch (error) {
      fs.closeSync(fd);
      throw error;
    }
  });
}

/**
 * Check that `filePath`, relative to its anchored directory, is still the
 * entry `expected` describes, and fail with `message` if it is not.
 */
function confirmInDirectory(
  filePath: string,
  expected: EntryIdentity,
  message: string,
): void {
  const name = path.basename(filePath);
  inDirectory(path.dirname(filePath), () => {
    let found: fs.BigIntStats | undefined;
    try {
      found = fs.lstatSync(name, { bigint: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    if (!found || !isSameEntry(found, expected)) {
      throw new Error(message);
    }
  });
}

/**
 * Remove `filePath`, relative to its anchored directory, only while it is
 * still the entry `expected` describes.
 */
function removeFromDirectory(
  filePath: string,
  expected: EntryIdentity,
  snapshot?: Pick<fs.BigIntStats, "size" | "mtimeNs" | "ctimeNs">,
): void {
  const name = path.basename(filePath);
  inDirectory(path.dirname(filePath), () => {
    const found = fs.lstatSync(name, { bigint: true });
    if (!isSameEntry(found, expected)) {
      throw new Error(
        `Refusing to remove: ${filePath} was replaced during the move`,
      );
    }
    // The same file, written to in place after it was copied: removing it
    // would lose what was written, so the copy is the one that goes.
    if (
      snapshot &&
      (found.size !== snapshot.size ||
        found.mtimeNs !== snapshot.mtimeNs ||
        found.ctimeNs !== snapshot.ctimeNs)
    ) {
      throw new Error(
        `Refusing to remove: ${filePath} changed during the move`,
      );
    }
    fs.unlinkSync(name);
  });
}

/** Remove a copy this move created, keeping the error that made it necessary. */
function discardCopy(destinationPath: string, created: EntryIdentity): void {
  try {
    removeFromDirectory(destinationPath, created);
  } catch {
    // Left in place; the error that made the move fail is the one to report.
  }
}

/**
 * Create `destinationPath`, which must not exist, as a copy of the file open
 * at `sourceFd`, with its mode and times. A copy that fails is removed.
 */
async function copyIntoNewFile(
  sourceFd: number,
  source: fs.BigIntStats,
  destinationPath: string,
): Promise<EntryIdentity> {
  // O_EXCL: an existing file or symlink fails with EEXIST, never followed.
  const { fd, opened } = openInDirectory(
    destinationPath,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      noFollow(),
    false,
    // Owner-only until the copy is complete and takes the source's mode, so
    // a private file is never readable at the destination in between.
    0o600,
  );
  // Where isSameEntry falls back to size and modification time (see there),
  // the identity from the create goes stale as the copy is written, so it is
  // read again from the descriptor before that closes.
  let identity: EntryIdentity = opened;
  try {
    try {
      const buffer = Buffer.alloc(64 * 1024);
      for (;;) {
        const bytesRead = await readChunk(sourceFd, buffer);
        if (bytesRead === 0) {
          break;
        }
        await writeChunk(fd, buffer.subarray(0, bytesRead));
      }
      await keepModeAndTimes(fd, source);
    } finally {
      try {
        identity = fs.fstatSync(fd, { bigint: true });
      } catch {
        // Keep the identity from the create; the close reports the fault.
      }
      await close(fd);
    }
  } catch (error) {
    discardCopy(destinationPath, identity);
    throw error;
  }
  return identity;
}

/**
 * Move the regular file at `sourcePath` to `destinationPath`, which must not
 * exist, where the two are on different devices: copy it into a newly created
 * file, then remove the source. If any step fails, the copy is removed and the
 * source is left where it was.
 */
export async function moveFileAcrossDevices(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  const { fd, opened: source } = openSourceInDirectory(sourcePath);
  // Set once the copy is complete; until then copyIntoNewFile cleans up.
  let created: EntryIdentity | undefined;
  try {
    try {
      created = await copyIntoNewFile(fd, source, destinationPath);
    } finally {
      await close(fd);
    }
    // The source goes only while the copy is still where the move put it.
    confirmInDirectory(
      destinationPath,
      created,
      `Refusing to remove the source: ${destinationPath} was removed or replaced during the move`,
    );
    removeFromDirectory(sourcePath, source, source);
  } catch (error) {
    if (created) {
      discardCopy(destinationPath, created);
    }
    throw error;
  }
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
