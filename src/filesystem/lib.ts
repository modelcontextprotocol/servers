import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import { StringDecoder } from "string_decoder";
import { createTwoFilesPatch } from "diff";
import { minimatch } from "minimatch";
import { normalizePathFormat, expandHome } from "./path-utils.js";
import { isPathWithinAllowedDirectories } from "./path-validation.js";
import {
  createDirectoryInPlace,
  createFileInDirectory,
  moveFileAcrossDevices,
  overwriteFileInDirectory,
  renameIntoDirectory,
} from "./pinned-directory.js";

// Type definitions
interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
  hardLinks: number;
}

export interface SearchOptions {
  excludePatterns?: string[];
}

export interface SearchResult {
  path: string;
  isDirectory: boolean;
}

// Bounds on the filesystem calls a request can wait on, and on the recursive
// walks (#4162). A path on a lazily materialized provider (a macOS
// CloudStorage or iCloud Drive folder, a slow network mount) can make
// realpath or readdir block for minutes while the provider fetches metadata,
// and a recursive walk over a large tree had no upper bound, so one request
// could stall the server past the client's own timeout.
//
// They are constants, not options: 15 s is far beyond a local call (which
// takes milliseconds), is the bound the issue's reporter ran for months against
// Google Drive and iCloud Drive trees without a misfire, and still answers
// before the 60 s default request timeout of the MCP SDK clients. 100,000 entries is far more than a
// result a model can use, and a walk that reaches it is told to narrow the path
// or add excludePatterns.
//
// A timeout only stops waiting. Node cannot cancel an fs call already in
// flight, so the stalled call keeps one of libuv's threadpool threads (4 by
// default) until the provider answers, and four stalled calls at once delay
// every other fs call in the process until one returns. The timeout still
// answers the request that hit it with an error instead of hanging.
export const FS_CALL_TIMEOUT_MS = 15_000;
export const MAX_WALK_ENTRIES = 100_000;

/** A filesystem call that did not settle within FS_CALL_TIMEOUT_MS. */
export class FsTimeoutError extends Error {
  constructor(operation: string, target: string) {
    super(
      `Filesystem call timed out after ${FS_CALL_TIMEOUT_MS} ms: ${operation} ${target}. ` +
        "The path may be on a cloud-storage or network provider that fetches it on demand; " +
        "try a narrower path, or exclude it with excludePatterns.",
    );
    this.name = "FsTimeoutError";
  }
}

/** A recursive walk that reached MAX_WALK_ENTRIES before it finished. */
export class WalkLimitError extends Error {
  constructor(operation: string, root: string, limit: number) {
    super(
      `${operation} stopped after visiting ${limit} entries under ${root}, without finishing. ` +
        "Narrow the path, or add excludePatterns for large subtrees.",
    );
    this.name = "WalkLimitError";
  }
}

// Races an fs call against FS_CALL_TIMEOUT_MS. The losing call is not
// cancelled (see above); Promise.race keeps a handler on it, so a late
// rejection is still handled.
async function withFsTimeout<T>(
  call: Promise<T>,
  operation: string,
  target: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new FsTimeoutError(operation, target)),
      FS_CALL_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * fs.realpath, bounded by FS_CALL_TIMEOUT_MS. A timeout rejects with
 * FsTimeoutError, which path validation treats as a refusal: a path whose real
 * location could not be read in time is never admitted.
 */
export function realpathWithTimeout(target: string): Promise<string> {
  return withFsTimeout(fs.realpath(target), "realpath", target);
}

/** fs.readdir with file types, bounded by FS_CALL_TIMEOUT_MS. */
export function readdirWithTimeout(target: string): Promise<Dirent[]> {
  return withFsTimeout(
    fs.readdir(target, { withFileTypes: true }),
    "readdir",
    target,
  );
}

/**
 * A counter for a recursive walk: each call records one visited entry and
 * throws WalkLimitError once the walk has visited more than MAX_WALK_ENTRIES.
 */
export function createEntryBudget(operation: string, root: string): () => void {
  let visited = 0;
  return () => {
    visited++;
    if (visited > MAX_WALK_ENTRIES) {
      throw new WalkLimitError(operation, root, MAX_WALK_ENTRIES);
    }
  };
}

// Pure Utility Functions
export function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  if (bytes <= 0) return "0 B";

  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  if (i < 0 || i === 0) return `${bytes} ${units[0]}`;

  const unitIndex = Math.min(i, units.length - 1);
  return `${(bytes / Math.pow(1024, unitIndex)).toFixed(2)} ${units[unitIndex]}`;
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function createUnifiedDiff(
  originalContent: string,
  newContent: string,
  filepath: string = "file",
): string {
  // Ensure consistent line endings for diff
  const normalizedOriginal = normalizeLineEndings(originalContent);
  const normalizedNew = normalizeLineEndings(newContent);

  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    "original",
    "modified",
  );
}

// Helper function to resolve relative paths against allowed directories
function resolveRelativePathAgainstAllowedDirectories(
  relativePath: string,
  allowedDirectories: readonly string[],
): string {
  if (allowedDirectories.length === 0) {
    // Fallback to process.cwd() if no allowed directories are set
    return path.resolve(process.cwd(), relativePath);
  }

  // Try to resolve relative path against each allowed directory
  for (const allowedDir of allowedDirectories) {
    const candidate = path.resolve(allowedDir, relativePath);
    const normalizedCandidate = normalizePathFormat(candidate);

    // Check if the resulting path lies within any allowed directory
    if (
      isPathWithinAllowedDirectories(normalizedCandidate, allowedDirectories)
    ) {
      return candidate;
    }
  }

  // If no valid resolution found, use the first allowed directory as base
  // This provides a consistent fallback behavior
  return path.resolve(allowedDirectories[0], relativePath);
}

// Security & Validation Functions

// The form two path components are compared in when the exact spelling is not
// on disk (#1970): canonically equivalent spellings (NFC/NFD, as macOS stores
// "é" or Japanese dakuten) match, and so do the Unicode space separators
// (U+00A0, the U+202F macOS puts before "PM" in a screenshot's name, ...),
// which a client typing the name back almost always sends as U+0020.
function unicodeMatchKey(component: string): string {
  return component.normalize("NFC").replace(/\p{Zs}/gu, " ");
}

// An allowed directory whose own name is spelled differently on disk (NFD)
// from the request (NFC) fails the allow-list check, which compares strings
// (#1970). Map such a request onto the allowed directory's own spelling, so
// the result is inside that directory by construction and every later check
// still runs against the real allow-list. A request that does not spell an
// allowed directory is returned unchanged and is refused as before.
function respellAllowedDirectoryPrefix(
  absolutePath: string,
  allowedDirectories: readonly string[],
): string {
  const requestedParts = absolutePath.split(path.sep).filter(Boolean);
  const candidates = allowedDirectories
    .map((directory) => path.resolve(directory))
    .sort((left, right) => right.length - left.length);
  for (const directory of candidates) {
    const directoryParts = directory.split(path.sep).filter(Boolean);
    if (
      directoryParts.length <= requestedParts.length &&
      directoryParts.every(
        (part, index) =>
          unicodeMatchKey(part) === unicodeMatchKey(requestedParts[index]),
      )
    ) {
      return path.join(
        directory,
        ...requestedParts.slice(directoryParts.length),
      );
    }
  }
  return absolutePath;
}

// The form two components are compared in when only their letter case may
// differ (#470). Folding alone proves nothing: whether two spellings name one
// entry is the file system's call, and namesOneEntry asks it.
function caseMatchKey(component: string): string {
  return unicodeMatchKey(component).toLowerCase();
}

// Whether `requested` names the same entry of `parent` as `configured`, an
// allowed directory's own component. Asked of the file system rather than
// folded, because NTFS and APFS directories can be case-sensitive, and there a
// name differing only in case is another entry, or none (#470). Both
// conditions must hold: `parent` holds exactly one entry matching the request
// case-insensitively, and the two spellings lstat to the same device and
// inode. Any error, a missing name included, answers no, so the request is
// refused as before.
async function namesOneEntry(
  parent: string,
  requested: string,
  configured: string,
): Promise<boolean> {
  try {
    const key = caseMatchKey(requested);
    const entries =
      (await withFsTimeout(fs.readdir(parent), "readdir", parent)) ?? [];
    if (entries.filter((entry) => caseMatchKey(entry) === key).length !== 1) {
      return false;
    }
    // Bounded like every request-path fs call (#4162); a timeout lands in the
    // catch below and answers no, so the request is refused.
    const requestedPath = path.join(parent, requested);
    const configuredPath = path.join(parent, configured);
    const requestedStats = await withFsTimeout(
      fs.lstat(requestedPath, { bigint: true }),
      "lstat",
      requestedPath,
    );
    const configuredStats = await withFsTimeout(
      fs.lstat(configuredPath, { bigint: true }),
      "lstat",
      configuredPath,
    );
    return (
      requestedStats.dev === configuredStats.dev &&
      requestedStats.ino === configuredStats.ino
    );
  } catch {
    return false;
  }
}

// An allowed directory whose own name the request spells in another letter
// case, matching neither the configured nor the on-disk spelling, fails the
// allow-list check, which compares strings (#470). Like the Unicode respelling
// above, map such a request onto the allowed directory's own spelling, but
// only where every component that differs in case is confirmed, segment by
// segment, by namesOneEntry. The result is inside that directory by
// construction, and every later check still runs against the real allow-list.
async function respellAllowedDirectoryCase(
  absolutePath: string,
  allowedDirectories: readonly string[],
): Promise<string> {
  const requestedRoot = path.parse(absolutePath).root;
  const requestedParts = absolutePath
    .slice(requestedRoot.length)
    .split(path.sep)
    .filter(Boolean);
  const candidates = allowedDirectories
    .map((directory) => path.resolve(directory))
    .sort((left, right) => right.length - left.length);
  for (const directory of candidates) {
    const root = path.parse(directory).root;
    const directoryParts = directory
      .slice(root.length)
      .split(path.sep)
      .filter(Boolean);
    // A root is "/" off Windows; on Windows its drive letter or UNC server
    // and share are case-insensitive by definition, so folding it is safe.
    if (
      caseMatchKey(root) !== caseMatchKey(requestedRoot) ||
      directoryParts.length > requestedParts.length ||
      !directoryParts.every(
        (part, index) =>
          caseMatchKey(part) === caseMatchKey(requestedParts[index]),
      )
    ) {
      continue;
    }
    let parent = root;
    let confirmed = true;
    for (let index = 0; index < directoryParts.length && confirmed; index++) {
      const part = directoryParts[index];
      const requestedPart = requestedParts[index];
      confirmed =
        unicodeMatchKey(part) === unicodeMatchKey(requestedPart) ||
        (await namesOneEntry(parent, requestedPart, part));
      parent = path.join(parent, part);
    }
    if (confirmed) {
      return path.join(
        directory,
        ...requestedParts.slice(directoryParts.length),
      );
    }
  }
  return absolutePath;
}

// Whether a directory entry of this name exists, without following it.
async function entryExists(entryPath: string): Promise<boolean> {
  try {
    await fs.lstat(entryPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function resolveUnicodeEquivalentPath(
  absolutePath: string,
  allowedDirectories: readonly string[],
): Promise<string> {
  const allowedDirectory = [...allowedDirectories]
    .sort((left, right) => right.length - left.length)
    .find((directory) =>
      isPathWithinAllowedDirectories(normalizePathFormat(absolutePath), [
        directory,
      ]),
    );

  /* v8 ignore next -- validatePath calls this only after the same allow-list check passed, so a containing directory always exists */
  if (!allowedDirectory) {
    return absolutePath;
  }

  let currentPath = await realpathWithTimeout(allowedDirectory);
  // An allowed directory can be a symlink (the advertised form of a Root or a
  // command-line directory), retargeted since it was allowed, so its realpath
  // is checked like every component below it (#5183).
  if (
    !isPathWithinAllowedDirectories(
      normalizePathFormat(currentPath),
      allowedDirectories,
    )
  ) {
    throw new Error(
      `Access denied - symlink target outside allowed directories: ${currentPath} not in ${allowedDirectories.join(", ")}`,
    );
  }
  const relativeParts = path
    .relative(allowedDirectory, absolutePath)
    .split(path.sep)
    .filter(Boolean);

  for (let index = 0; index < relativeParts.length; index++) {
    const requestedPart = relativeParts[index];
    const entries =
      (await withFsTimeout(fs.readdir(currentPath), "readdir", currentPath)) ??
      [];
    const exactMatch = entries.find((entry) => entry === requestedPart);
    const equivalentMatches = exactMatch
      ? [exactMatch]
      : entries.filter(
          (entry) => unicodeMatchKey(entry) === unicodeMatchKey(requestedPart),
        );

    if (equivalentMatches.length > 1) {
      throw new Error(`Ambiguous Unicode path component: ${requestedPart}`);
    }

    // When no entry matches by spelling, the requested name still goes to the
    // OS as it is: on a case-insensitive file system (macOS and Windows by
    // default) it can name an existing entry spelled with other letter case,
    // and that entry can be a symlink that leaves the allowed directories. So
    // it is resolved and checked like a match, and only a name that does not
    // exist at all (lstat, so a dangling symlink still counts as existing)
    // starts the missing tail.
    const candidate = path.join(
      currentPath,
      equivalentMatches[0] ?? requestedPart,
    );
    if (equivalentMatches.length === 0 && !(await entryExists(candidate))) {
      // Nothing below this point exists yet, so there are no symlinks left to
      // resolve. currentPath is already realpath'd and inside an allowed
      // directory; append the missing tail so create_directory can mkdir -p it.
      return path.join(currentPath, ...relativeParts.slice(index));
    }

    currentPath = await realpathWithTimeout(candidate);
    if (
      !isPathWithinAllowedDirectories(
        normalizePathFormat(currentPath),
        allowedDirectories,
      )
    ) {
      throw new Error(
        `Access denied - symlink target outside allowed directories: ${currentPath} not in ${allowedDirectories.join(", ")}`,
      );
    }
  }

  return currentPath;
}

// The allow-list is passed in rather than read from module state, so each
// server instance (see server.ts) validates against its own directories and two
// instances can coexist in one process (#4854).
export async function validatePath(
  requestedPath: string,
  allowedDirectories: readonly string[],
): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  // Do not silently reinterpret a Windows drive path as a relative POSIX path.
  // This would create a literal filename such as `C:\\Users\\...` inside the
  // allowed root and report success for the wrong location.
  if (
    process.platform !== "win32" &&
    /^(?:[A-Za-z]:)(?:[\\/]|$)/.test(expandedPath)
  ) {
    throw new Error(
      `Access denied - Windows-style path received on a POSIX host: ${requestedPath}`,
    );
  }
  let absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : resolveRelativePathAgainstAllowedDirectories(
        expandedPath,
        allowedDirectories,
      );
  if (
    !isPathWithinAllowedDirectories(
      normalizePathFormat(absolute),
      allowedDirectories,
    )
  ) {
    absolute = respellAllowedDirectoryPrefix(absolute, allowedDirectories);
    if (
      !isPathWithinAllowedDirectories(
        normalizePathFormat(absolute),
        allowedDirectories,
      )
    ) {
      absolute = await respellAllowedDirectoryCase(
        absolute,
        allowedDirectories,
      );
    }
  }

  const normalizedRequested = normalizePathFormat(absolute);

  // Security: Check if path is within allowed directories before any file operations
  const isAllowed = isPathWithinAllowedDirectories(
    normalizedRequested,
    allowedDirectories,
  );
  if (!isAllowed) {
    throw new Error(
      allowedDirectories.length === 0
        ? `Access denied - no allowed directories: the client exposes no valid roots (${absolute})`
        : `Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(", ")}`,
    );
  }

  // Security: Handle symlinks by checking their real path to prevent symlink attacks
  // This prevents attackers from creating symlinks that point outside allowed directories
  try {
    const realPath = await realpathWithTimeout(absolute);
    const normalizedReal = normalizePathFormat(realPath);
    if (!isPathWithinAllowedDirectories(normalizedReal, allowedDirectories)) {
      throw new Error(
        `Access denied - symlink target outside allowed directories: ${realPath} not in ${allowedDirectories.join(", ")}`,
      );
    }
    return realPath;
  } catch (error) {
    // Security: For new files that don't exist yet, verify parent directory
    // This ensures we can't create files in unauthorized locations
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        return await resolveUnicodeEquivalentPath(absolute, allowedDirectories);
      } catch (resolutionError) {
        if ((resolutionError as NodeJS.ErrnoException).code === "ENOENT") {
          throw new Error(
            `Parent directory does not exist: ${path.dirname(absolute)}`,
            { cause: resolutionError },
          );
        }
        throw resolutionError;
      }
    }
    throw error;
  }
}

// File Operations
export async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
    // The link count: more than 1 means a file has other names, possibly
    // outside the allowed directories, that a write here also changes.
    hardLinks: stats.nlink,
  };
}

export async function readFileContent(
  filePath: string,
  encoding: string = "utf-8",
): Promise<string> {
  return await fs.readFile(filePath, encoding as BufferEncoding);
}

export async function writeFileContent(
  filePath: string,
  content: string,
): Promise<void> {
  try {
    // Security: exclusive creation fails if a file or symlink exists, so a
    // pre-existing symlink is never written through; the directory is pinned
    // (see pinned-directory.ts), so a swapped one is never written through.
    await createFileInDirectory(filePath, content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      await overwriteInPlace(filePath, content);
    } else {
      throw error;
    }
  }
}

/**
 * Replace an existing file's content in place, through a single handle.
 *
 * Writing through the existing file, rather than renaming a temp file over it,
 * keeps its identity: the inode, creation time (birthtime), hard links,
 * permission bits and anything watching it by inode all survive (#4512). It
 * also never renames over the target, which on Windows fails with EPERM when
 * another process holds the file open without FILE_SHARE_DELETE (#3199).
 *
 * Security: the path was validated before this runs, so something swapped in
 * since then must not be written through (TOCTOU):
 * - lstat refuses anything at the path that is not a regular file, a symlink
 *   included;
 * - the open happens inside the pinned directory (pinned-directory.ts), so a
 *   directory on the path swapped for a symlink cannot redirect it;
 * - O_NOFOLLOW makes the open itself fail with ELOOP on a symlink (POSIX
 *   only), and the opened handle must be the very file lstat saw (same device
 *   and inode, compared as BigInts so a 64-bit file id cannot round; where
 *   Windows reports no device for the path, same inode, size and mtime: see
 *   isSameEntry in pinned-directory.ts, #5154), which catches a swap between
 *   the lstat and the open. Once the handle is verified, every write goes
 *   through it.
 *
 * The trade-off is crash-atomicity: a crash mid-write leaves a partly written
 * file, where the rename left either the old content or the new.
 */
async function overwriteInPlace(
  filePath: string,
  content: string,
): Promise<void> {
  const expected = await fs.lstat(filePath, { bigint: true });
  if (!expected.isFile()) {
    throw new Error(`Refusing to write: not a regular file: ${filePath}`);
  }
  await overwriteFileInDirectory(filePath, content, expected);
}

/** Create a directory and any missing parents (see pinned-directory.ts). */
export async function createDirectory(directoryPath: string): Promise<void> {
  createDirectoryInPlace(directoryPath);
}

export async function moveFile(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  // The move_file tool contract (and README) state the operation fails if the
  // destination already exists. fs.rename would silently overwrite it, which is
  // a data-loss bug, so reject up front when anything - file, directory, or
  // symlink - occupies the target. lstat is used so an existing symlink at the
  // destination is detected rather than followed.
  try {
    await fs.lstat(destinationPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // The destination's directory is pinned (see pinned-directory.ts).
      try {
        renameIntoDirectory(sourcePath, destinationPath);
      } catch (renameError) {
        // rename cannot cross a device boundary: copy, then remove (#5188).
        if ((renameError as NodeJS.ErrnoException).code !== "EXDEV") {
          throw renameError;
        }
        await moveFileAcrossDevices(sourcePath, destinationPath);
      }
      return;
    }
    throw error;
  }
  throw new Error(`Destination already exists: ${destinationPath}`);
}

// File Editing Functions
interface FileEdit {
  oldText: string;
  newText: string;
}

/**
 * The line ending a file predominantly uses: CRLF when more of its line breaks
 * are CRLF than bare LF, otherwise LF. A file with mixed endings is written
 * back with its predominant one.
 */
export function detectLineEnding(text: string): "\r\n" | "\n" {
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  const lf = (text.match(/\n/g)?.length ?? 0) - crlf;
  return crlf > lf ? "\r\n" : "\n";
}

function leadingWhitespace(line: string): string {
  return line.slice(0, line.length - line.trimStart().length);
}

/**
 * The indentation unit of some lines: a tab when any indented line starts
 * with one, otherwise the narrowest run of leading spaces, or "" when no line
 * is indented.
 */
function indentUnit(lines: string[]): string {
  let narrowest = Infinity;
  for (const line of lines) {
    const indent = leadingWhitespace(line);
    if (indent === "" || line.trim() === "") continue;
    if (indent.includes("\t")) return "\t";
    narrowest = Math.min(narrowest, indent.length);
  }
  return narrowest === Infinity ? "" : " ".repeat(narrowest);
}

/**
 * Reindents one replacement line for the whitespace-tolerant matcher: it gets
 * the indentation of `fileLine` (the file line it replaces), plus or minus the
 * difference between its own indentation and `oldLine`'s (the oldText line
 * that matched `fileLine`). A dedent never goes below no indentation. A blank
 * line is kept as given.
 *
 * When the edit and the file indent with different characters (tabs in one,
 * spaces in the other), the difference is counted in indent levels of the
 * edit's unit and applied in the file's unit, so four spaces of extra
 * indent in the edit become one tab in a tab-indented file.
 */
function reindentLine(
  line: string,
  fileLine: string,
  oldLine: string,
  editUnit: string,
  fileUnit: string,
): string {
  const body = line.trimStart();
  if (body === "") return line;
  const fileIndent = leadingWhitespace(fileLine);
  const newIndent = leadingWhitespace(line);
  const delta = newIndent.length - leadingWhitespace(oldLine).length;
  if (editUnit && fileUnit && (editUnit === "\t") !== (fileUnit === "\t")) {
    const levels = Math.trunc(delta / editUnit.length);
    const indent =
      levels >= 0
        ? fileIndent + fileUnit.repeat(levels)
        : fileIndent.slice(
            0,
            Math.max(0, fileIndent.length + levels * fileUnit.length),
          );
    return indent + body;
  }
  const indent =
    delta >= 0
      ? fileIndent + newIndent.slice(newIndent.length - delta)
      : fileIndent.slice(0, Math.max(0, fileIndent.length + delta));
  return indent + body;
}

// What the no-match error shows (#2034). A model that sent oldText which
// differs from the file in a way the matcher does not tolerate (whitespace
// inside a line, a typo, stale content) needs the file's real text to retry
// with, so the error quotes the closest run of lines with their line
// numbers. Finding it compares oldText against the lines at every position
// of the file, so it is skipped past a fixed budget of bigram lookups rather
// than stalling the error on a huge file or a huge oldText.
const MISMATCH_WORK_LIMIT = 10_000_000;
const MISMATCH_CONTEXT_LINES = 2;
const MISMATCH_MAX_REGION_LINES = 30;
// A quoted file line is cut at this many characters, so a long line (minified
// code, one-line JSON) cannot blow the error up to the size of the file.
const MISMATCH_MAX_LINE_CHARS = 500;

interface LineGrams {
  grams: Map<string, number>;
  size: number;
}

/** A line's character bigrams with all whitespace removed, for similarity. */
function lineGrams(line: string): LineGrams {
  const text = line.replace(/\s+/g, "");
  const grams = new Map<string, number>();
  if (text.length === 1) grams.set(text, 1);
  for (let i = 0; i < text.length - 1; i++) {
    const gram = text.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  let size = 0;
  for (const count of grams.values()) size += count;
  return { grams, size };
}

/** Dice similarity of two lines' bigrams: 1 for two blank lines, 0 for nothing shared. */
function lineSimilarity(a: LineGrams, b: LineGrams): number {
  if (a.size + b.size === 0) return 1;
  let shared = 0;
  for (const [gram, count] of a.grams) {
    shared += Math.min(count, b.grams.get(gram) ?? 0);
  }
  return (2 * shared) / (a.size + b.size);
}

/**
 * The error message for an edit that matched nowhere in `content` (the file
 * as the earlier edits in the same call left it). It names the edit, says
 * what the matcher tolerates, and quotes the run of file lines most similar
 * to oldText, numbered, with the first line that differs shown quoted so
 * whitespace is visible. It only reports: it never changes what matches.
 */
export function describeEditMismatch(
  content: string,
  oldText: string,
  editIndex: number,
  editCount: number,
): string {
  const oldLines = normalizeLineEndings(oldText).split("\n");
  // The lines as the matcher sees them, so a terminal newline in oldText
  // lines up with the file's. The empty element after a terminal newline is
  // not a line of the file, so it is left out of what is counted and shown.
  const fileLines = content.split("\n");
  const lineCount = content.endsWith("\n")
    ? fileLines.length - 1
    : content === ""
      ? 0
      : fileLines.length;

  const parts = [
    `Could not find exact match for edit ${editIndex + 1} of ${editCount}. ` +
      "oldText must match the file's text exactly; only line endings, and " +
      "leading and trailing whitespace on whole lines, may differ. " +
      "No edits were applied.",
    `oldText:\n${oldText}`,
  ];

  if (lineCount === 0) {
    parts.push("The file is empty.");
    return parts.join("\n\n");
  }

  const oldGrams = oldLines.map(lineGrams);
  let oldWork = 0;
  for (const line of oldGrams) oldWork += line.grams.size + 1;
  if (fileLines.length * oldWork > MISMATCH_WORK_LIMIT) {
    parts.push(
      `The file has ${lineCount} lines, too many to search for the closest ` +
        "text to this oldText. Read the file and copy oldText from it exactly.",
    );
    return parts.join("\n\n");
  }

  // Every starting line is scored, including those near the end where fewer
  // lines than oldText has remain, so a near match at the end of the file is
  // still found. The earliest start wins a tie.
  const fileGrams = fileLines.map(lineGrams);
  let best = 0;
  let bestScore = 0;
  for (let i = 0; i < fileLines.length; i++) {
    const width = Math.min(oldLines.length, fileLines.length - i);
    let score = 0;
    for (let j = 0; j < width; j++) {
      score += lineSimilarity(oldGrams[j], fileGrams[i + j]);
    }
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }

  if (bestScore === 0) {
    parts.push(
      "No line of the file resembles oldText. Read the file and copy " +
        "oldText from it exactly.",
    );
    return parts.join("\n\n");
  }

  const start = Math.min(
    Math.max(0, best - MISMATCH_CONTEXT_LINES),
    lineCount - 1,
  );
  const end = Math.min(
    lineCount,
    best + oldLines.length + MISMATCH_CONTEXT_LINES,
    start + MISMATCH_MAX_REGION_LINES,
  );
  let clipped = false;
  const clip = (line: string): string => {
    if (line.length <= MISMATCH_MAX_LINE_CHARS) return line;
    clipped = true;
    return (
      line.slice(0, MISMATCH_MAX_LINE_CHARS) +
      ` [... cut: the line has ${line.length} characters]`
    );
  };
  const numbered = fileLines
    .slice(start, end)
    .map((line, k) => `${start + k + 1}: ${clip(line)}`);
  const after = editIndex > 0 ? ", after the earlier edits in this call" : "";
  parts.push(
    `Closest text in the file (lines ${start + 1}-${end} of ` +
      `${lineCount}${after}):\n${numbered.join("\n")}`,
  );

  // Some line differs beyond leading and trailing whitespace, or oldText runs
  // past the file's end: otherwise the line-by-line matcher would have
  // matched here. Math.max only keeps the index a valid one.
  const differs = Math.max(
    0,
    oldLines.findIndex(
      (line, j) =>
        best + j >= lineCount || line.trim() !== fileLines[best + j].trim(),
    ),
  );
  parts.push(
    best + differs >= lineCount
      ? `oldText line ${differs + 1} (${JSON.stringify(clip(oldLines[differs]))}) ` +
          `runs past the end of the file, which ends at line ${lineCount}.`
      : `First difference, oldText line ${differs + 1} against file line ` +
          `${best + differs + 1}:\n` +
          `  oldText: ${JSON.stringify(clip(oldLines[differs]))}\n` +
          `  file:    ${JSON.stringify(clip(fileLines[best + differs]))}`,
  );
  parts.push(
    clipped
      ? "Some lines above were cut. Read the file to copy oldText from it " +
          "exactly."
      : "Retry with oldText copied exactly from the file, without the " +
          "line-number prefixes.",
  );
  return parts.join("\n\n");
}

export async function applyFileEdits(
  filePath: string,
  edits: FileEdit[],
  dryRun: boolean = false,
): Promise<string> {
  // Read file content and normalize line endings, remembering which ending
  // the file uses so the edited file is written back with it (#4991).
  const rawContent = await fs.readFile(filePath, "utf-8");
  const eol = detectLineEnding(rawContent);
  const content = normalizeLineEndings(rawContent);

  // Apply edits sequentially
  let modifiedContent = content;
  for (const [index, edit] of edits.entries()) {
    const normalizedOld = normalizeLineEndings(edit.oldText);
    const normalizedNew = normalizeLineEndings(edit.newText);

    // If exact match exists, use it
    if (modifiedContent.includes(normalizedOld)) {
      modifiedContent = modifiedContent.replace(
        normalizedOld,
        () => normalizedNew,
      );
      continue;
    }

    // Otherwise, try line-by-line matching with flexibility for whitespace
    const oldLines = normalizedOld.split("\n");
    const contentLines = modifiedContent.split("\n");
    let matchFound = false;

    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      const potentialMatch = contentLines.slice(i, i + oldLines.length);

      // Compare lines with normalized whitespace
      const isMatch = oldLines.every((oldLine, j) => {
        const contentLine = potentialMatch[j];
        return oldLine.trim() === contentLine.trim();
      });

      if (isMatch) {
        // Each replacement line takes the indentation of the file line it
        // replaces, shifted by however much the edit indents or dedents it
        // relative to the matching oldText line (#4990). Lines beyond
        // oldText's length are placed relative to its last line.
        const editUnit = indentUnit([
          ...oldLines,
          ...normalizedNew.split("\n"),
        ]);
        const fileUnit = indentUnit(contentLines);
        const newLines = normalizedNew.split("\n").map((line, j) => {
          const k = Math.min(j, oldLines.length - 1);
          return reindentLine(
            line,
            potentialMatch[k],
            oldLines[k],
            editUnit,
            fileUnit,
          );
        });

        contentLines.splice(i, oldLines.length, ...newLines);
        modifiedContent = contentLines.join("\n");
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      throw new Error(
        describeEditMismatch(
          modifiedContent,
          edit.oldText,
          index,
          edits.length,
        ),
      );
    }
  }

  // Create unified diff
  const diff = createUnifiedDiff(content, modifiedContent, filePath);

  // Write the file back with the line ending it was read with (#4991).
  if (eol === "\r\n") {
    modifiedContent = modifiedContent.replace(/\n/g, "\r\n");
  }

  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n\n`;

  if (!dryRun) {
    await overwriteInPlace(filePath, modifiedContent);
  }

  return formattedDiff;
}

// Memory-efficient implementation to get the last N lines of a file
export async function tailFile(
  filePath: string,
  numLines: number,
): Promise<string> {
  const CHUNK_SIZE = 1024; // Read 1KB at a time
  const stats = await fs.stat(filePath);
  const fileSize = stats.size;

  if (fileSize === 0) return "";

  // Open file for reading
  const fileHandle = await fs.open(filePath, "r");
  try {
    const chunks: Buffer[] = [];
    let position = fileSize;
    const chunk = Buffer.alloc(CHUNK_SIZE);
    let newlinesFound = 0;
    // A final newline ends the last line rather than starting an empty one,
    // so it is not one of the N line breaks the loop needs to see. Set from
    // the file's last byte on the first read (CRLF ends in 0x0a too).
    let newlinesNeeded = numLines;

    // Read chunks from the end of the file until the start of the first of
    // the last N lines is in hand
    while (position > 0 && newlinesFound < newlinesNeeded) {
      const size = Math.min(CHUNK_SIZE, position);
      const atEnd = position === fileSize;
      position -= size;

      const { bytesRead } = await fileHandle.read(chunk, 0, size, position);
      if (!bytesRead) break;

      const readData = Buffer.from(chunk.subarray(0, bytesRead));
      if (atEnd && readData[bytesRead - 1] === 0x0a) newlinesNeeded++;
      chunks.unshift(readData);
      for (const byte of readData) {
        if (byte === 0x0a) newlinesFound++;
      }
    }

    // Drop one trailing newline so it does not count as an empty last line,
    // and so the result ends the way headFile's does: without one.
    const text = normalizeLineEndings(
      Buffer.concat(chunks).toString("utf-8"),
    ).replace(/\n$/, "");
    return text.split("\n").slice(-numLines).join("\n");
  } finally {
    await fileHandle.close();
  }
}

// New function to get the first N lines of a file
export async function headFile(
  filePath: string,
  numLines: number,
): Promise<string> {
  const fileHandle = await fs.open(filePath, "r");
  try {
    const lines: string[] = [];
    let buffer = "";
    let bytesRead = 0;
    const chunk = Buffer.alloc(1024); // 1KB buffer
    const decoder = new StringDecoder("utf-8");

    // Read chunks and count lines until we have enough or reach EOF
    while (lines.length < numLines) {
      const result = await fileHandle.read(chunk, 0, chunk.length, bytesRead);
      if (result.bytesRead === 0) break; // End of file
      bytesRead += result.bytesRead;
      buffer += decoder.write(chunk.subarray(0, result.bytesRead));

      const newLineIndex = buffer.lastIndexOf("\n");
      if (newLineIndex !== -1) {
        const completeLines = buffer.slice(0, newLineIndex).split("\n");
        buffer = buffer.slice(newLineIndex + 1);
        for (const line of completeLines) {
          // Each of these lines ended in "\n"; drop the "\r" of a CRLF ending
          // so head normalizes line endings the way tailFile does. A "\r"
          // whose "\n" is still in the next chunk stays in the buffer until
          // that "\n" arrives, so a pair split across chunks is handled too.
          lines.push(line.endsWith("\r") ? line.slice(0, -1) : line);
          if (lines.length >= numLines) break;
        }
      }
    }

    buffer += decoder.end();

    // If there is leftover content and we still need lines, add it
    if (buffer.length > 0 && lines.length < numLines) {
      lines.push(buffer);
    }

    return lines.join("\n");
  } finally {
    await fileHandle.close();
  }
}

export async function searchFilesWithValidation(
  rootPath: string,
  pattern: string,
  allowedDirectories: readonly string[],
  options: SearchOptions = {},
): Promise<string[]> {
  const { excludePatterns = [] } = options;
  const results: string[] = [];
  const visit = createEntryBudget("search_files", rootPath);

  async function search(currentPath: string) {
    const entries = await readdirWithTimeout(currentPath);

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Excludes are matched on the name before the entry is validated, so an
      // excluded subtree is never realpath'd or read (#4162): excluding a slow
      // provider folder keeps the walk from touching it at all.
      const relativePath = path.relative(rootPath, fullPath);
      const shouldExclude = excludePatterns.some((excludePattern) =>
        minimatch(relativePath, excludePattern, { dot: true }),
      );
      if (shouldExclude) continue;

      visit();

      try {
        await validatePath(fullPath, allowedDirectories);

        // Use glob matching for the search pattern
        if (minimatch(relativePath, pattern, { dot: true })) {
          results.push(fullPath);
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // A timeout or the entry cap ends the whole search with its error
        // rather than returning partial results as if they were complete; any
        // other failure (an entry refused or unreadable) skips that entry.
        if (
          error instanceof FsTimeoutError ||
          error instanceof WalkLimitError
        ) {
          throw error;
        }
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}
