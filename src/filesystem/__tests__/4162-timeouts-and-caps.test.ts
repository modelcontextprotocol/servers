// Regression tests for issue #4162: recursive search / validatePath can hang
// for minutes on macOS CloudStorage / lazy provider-backed paths. The patch
// adds:
//   - a timeout wrapper around fs.realpath in validatePath
//   - a timeout wrapper around fs.readdir in searchFilesWithValidation
//   - a max-visited-entries cap on recursive search
//   - boundary-aware FS_SEARCH_EXCLUDE_PREFIXES that refuses recursive search
//     outright on user-configured roots
//
// These tests use fake timers to exercise the timeout paths without slow real
// waits, and mock fs/promises at the module level so no real filesystem state
// is touched.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import type { Dirent } from 'fs';

vi.mock('fs/promises');
const mockFs = fs as any;

// The diff reads its env vars at module load. We don't try to retune them per
// test (which would need module re-import dance); we trust the defaults and
// drive behaviour by making the mocked fs call hang past the default timeout
// or by enumerating enough mocked entries to exceed the default cap.
//
// Default timeout is 15s (FS_OP_TIMEOUT_MS). With fake timers we just advance
// past that — no real wait.
// Default visited cap is 50_000 (FS_SEARCH_MAX_VISITED). We mock readdir to
// return one directory containing that many synthetic entries.

const ALLOWED = process.platform === 'win32' ? ['C:\\allowed'] : ['/allowed'];
const ROOT = process.platform === 'win32' ? 'C:\\allowed' : '/allowed';
const FILE = process.platform === 'win32' ? 'C:\\allowed\\file.txt' : '/allowed/file.txt';

function mkDirent(name: string, isDir = false): Dirent {
  return {
    name,
    isFile: () => !isDir,
    isDirectory: () => isDir,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    parentPath: '',
    path: '',
  } as unknown as Dirent;
}

describe('issue #4162: timeouts + max-visited cap', () => {
  let setAllowedDirectories: typeof import('../lib.js').setAllowedDirectories;
  let validatePath: typeof import('../lib.js').validatePath;
  let searchFilesWithValidation: typeof import('../lib.js').searchFilesWithValidation;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const lib = await import('../lib.js');
    setAllowedDirectories = lib.setAllowedDirectories;
    validatePath = lib.validatePath;
    searchFilesWithValidation = lib.searchFilesWithValidation;
    setAllowedDirectories(ALLOWED);
  });

  afterEach(() => {
    setAllowedDirectories([]);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('validatePath: fs.realpath timeout', () => {
    it('rejects with FsTimeoutError when realpath hangs past FS_OP_TIMEOUT_MS', async () => {
      vi.useFakeTimers();
      // realpath returns a promise that never settles — the previous code would
      // hang forever; the patch must surface a timeout.
      mockFs.realpath.mockImplementation(() => new Promise(() => {}));

      const op = validatePath(FILE);
      // Attach a no-op catch BEFORE timer fires, so the rejection is "handled"
      // by the time vi.advanceTimersByTimeAsync flushes microtasks. Without
      // this, vitest's strict unhandled-rejection checker trips even though
      // expect.rejects below will observe the same rejection.
      op.catch(() => {});
      // Advance past the 15s default. We use 20s for a margin.
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(op).rejects.toThrow(/timed out/i);
    });

    it('preserves ENOENT path: surfaces "Parent directory does not exist" when both realpaths reject ENOENT', async () => {
      // Regression for the ENOENT-branch refactor in the patch — a non-existent
      // file with a non-existent parent must still produce the original error,
      // not a misleading timeout.
      const enoent = (): NodeJS.ErrnoException => {
        const e = new Error('ENOENT') as NodeJS.ErrnoException;
        e.code = 'ENOENT';
        return e;
      };
      mockFs.realpath
        .mockRejectedValueOnce(enoent())
        .mockRejectedValueOnce(enoent());

      await expect(
        validatePath(
          process.platform === 'win32'
            ? 'C:\\allowed\\missing\\file.txt'
            : '/allowed/missing/file.txt',
        ),
      ).rejects.toThrow(/Parent directory does not exist/);
    });

    it('ENOENT-branch realpath timeout surfaces as FsTimeoutError, not masked as missing-parent', async () => {
      // Verifies the refactor: a hung parent realpath must propagate the
      // timeout rather than collapse into "Parent directory does not exist".
      vi.useFakeTimers();
      const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
      enoent.code = 'ENOENT';
      mockFs.realpath
        .mockRejectedValueOnce(enoent)
        .mockImplementationOnce(() => new Promise(() => {})); // parent hangs

      const op = validatePath(
        process.platform === 'win32'
          ? 'C:\\allowed\\new\\file.txt'
          : '/allowed/new/file.txt',
      );
      op.catch(() => {}); // see note above
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(op).rejects.toThrow(/timed out/i);
    });
  });

  describe('searchFilesWithValidation: fs.readdir timeout', () => {
    it('rejects with FsTimeoutError when readdir hangs past FS_OP_TIMEOUT_MS', async () => {
      vi.useFakeTimers();
      mockFs.realpath.mockImplementation(async (p: any) => p.toString());
      mockFs.readdir.mockImplementation(() => new Promise(() => {}));

      const op = searchFilesWithValidation(ROOT, '**/*', ALLOWED);
      op.catch(() => {}); // see note above
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(op).rejects.toThrow(/timed out/i);
    });

    it('per-entry timeout propagates instead of being swallowed by catch-continue', async () => {
      // Critical for the patch: the existing per-entry `catch { continue }`
      // must re-throw FsTimeoutError so a search never returns silently-partial
      // results. We make readdir succeed once with two entries, the second of
      // which has a realpath that hangs.
      vi.useFakeTimers();
      mockFs.readdir.mockResolvedValueOnce([
        mkDirent('a.txt'),
        mkDirent('b.txt'),
      ]);
      // First entry's realpath resolves fine, second hangs forever.
      let call = 0;
      mockFs.realpath.mockImplementation((p: any) => {
        call++;
        if (call === 1) return Promise.resolve(p.toString());
        return new Promise(() => {});
      });

      const op = searchFilesWithValidation(ROOT, '**/*', ALLOWED);
      op.catch(() => {}); // see note above
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(op).rejects.toThrow(/timed out/i);
    });
  });

  describe('searchFilesWithValidation: FS_SEARCH_MAX_VISITED cap', () => {
    // Drive the cap via env-var rather than a 50_001-entry fixture: cleaner,
    // faster, and exercises the same code path. Module is re-imported per test
    // so the module-level read of FS_SEARCH_MAX_VISITED picks up our value.
    beforeEach(async () => {
      vi.resetModules();
      process.env.FS_SEARCH_MAX_VISITED = '5';
      const lib = await import('../lib.js');
      setAllowedDirectories = lib.setAllowedDirectories;
      searchFilesWithValidation = lib.searchFilesWithValidation;
      setAllowedDirectories(ALLOWED);
    });

    afterEach(() => {
      delete process.env.FS_SEARCH_MAX_VISITED;
    });

    it('aborts with a typed FsSearchTruncatedError once the visited cap is exceeded', async () => {
      const { FsSearchTruncatedError } = await import('../lib.js');
      const entries: Dirent[] = [];
      for (let i = 0; i < 10; i++) entries.push(mkDirent(`f${i}.txt`));
      mockFs.readdir.mockResolvedValue(entries);
      mockFs.realpath.mockImplementation(async (p: any) => p.toString());

      // Message is still clear...
      await expect(
        searchFilesWithValidation(ROOT, '**/*', ALLOWED),
      ).rejects.toThrow(/Search aborted after visiting/);

      // ...and the abort is observable by type (parity with FsTimeoutError),
      // carrying the visit count + cap for diagnostics.
      const err = await searchFilesWithValidation(ROOT, '**/*', ALLOWED).catch(e => e);
      expect(err).toBeInstanceOf(FsSearchTruncatedError);
      expect(err.visited).toBeGreaterThanOrEqual(5);
      expect(err.maxVisited).toBe(5);
    });

    it('returns normally when entry count is well under the cap', async () => {
      mockFs.readdir.mockResolvedValueOnce([
        mkDirent('hit.txt'),
        mkDirent('miss.log'),
      ]);
      mockFs.realpath.mockImplementation(async (p: any) => p.toString());

      const out = await searchFilesWithValidation(ROOT, '**/*.txt', ALLOWED);
      expect(out.some(p => p.endsWith('hit.txt'))).toBe(true);
      expect(out.some(p => p.endsWith('miss.log'))).toBe(false);
    });
  });

  describe('FS_SEARCH_EXCLUDE_PREFIXES', () => {
    // Set the env var BEFORE importing lib.ts so the module-level read picks
    // it up. We isolate this in its own describe so vi.resetModules() rewinds
    // cleanly between tests.
    const EXCLUDED = process.platform === 'win32' ? 'C:\\allowed\\slow' : '/allowed/slow';

    beforeEach(async () => {
      vi.resetModules();
      process.env.FS_SEARCH_EXCLUDE_PREFIXES = EXCLUDED;
      const lib = await import('../lib.js');
      setAllowedDirectories = lib.setAllowedDirectories;
      searchFilesWithValidation = lib.searchFilesWithValidation;
      setAllowedDirectories(ALLOWED);
    });

    afterEach(() => {
      delete process.env.FS_SEARCH_EXCLUDE_PREFIXES;
    });

    it('refuses recursive search when root is inside an excluded prefix', async () => {
      await expect(
        searchFilesWithValidation(EXCLUDED, '**/*', ALLOWED),
      ).rejects.toThrow(/Recursive search is disabled/);
    });

    it('does not match an unrelated sibling that merely shares a string head (boundary-aware)', async () => {
      // /allowed/slowdown must NOT be excluded just because '/allowed/slow' is
      // a substring of it. This is the containment-via-isPathWithinAllowedDirectories
      // guarantee from the patch.
      const sibling = process.platform === 'win32' ? 'C:\\allowed\\slowdown' : '/allowed/slowdown';
      mockFs.readdir.mockResolvedValueOnce([mkDirent('ok.txt')]);
      mockFs.realpath.mockImplementation(async (p: any) => p.toString());

      const out = await searchFilesWithValidation(sibling, '**/*', ALLOWED);
      expect(out.length).toBeGreaterThanOrEqual(0); // did not throw
    });

    it('shared helper assertSearchPathNotExcluded customises the operation name', async () => {
      // The same containment check is reused by the directory_tree handler in
      // index.ts via assertSearchPathNotExcluded(rootPath, 'directory_tree').
      // We can't unit-test the inline handler directly, but we can exercise
      // the shared helper to confirm the error wording reflects the opName.
      const { assertSearchPathNotExcluded } = await import('../lib.js');
      expect(() => assertSearchPathNotExcluded(EXCLUDED, 'directory_tree'))
        .toThrow(/directory_tree is disabled.*FS_SEARCH_EXCLUDE_PREFIXES/);
    });

    it('helper rejects descendants of an excluded prefix, not just the exact root', async () => {
      const { assertSearchPathNotExcluded } = await import('../lib.js');
      const descendant = process.platform === 'win32'
        ? 'C:\\allowed\\slow\\nested\\deep'
        : '/allowed/slow/nested/deep';
      expect(() => assertSearchPathNotExcluded(descendant, 'directory_tree'))
        .toThrow(/directory_tree is disabled/);
    });

    it('helper allows a sibling that merely shares a textual prefix with the excluded root', async () => {
      // /allowed/slowdown is NOT a descendant of /allowed/slow even though
      // the latter is a string prefix -- the containment check is boundary-aware.
      const { assertSearchPathNotExcluded } = await import('../lib.js');
      const sibling = process.platform === 'win32' ? 'C:\\allowed\\slowdown' : '/allowed/slowdown';
      expect(() => assertSearchPathNotExcluded(sibling, 'directory_tree')).not.toThrow();
    });
  });

  describe('env-var validation', () => {
    afterEach(() => {
      delete process.env.FS_OP_TIMEOUT_MS;
      delete process.env.FS_SEARCH_MAX_VISITED;
    });

    it('ignores non-numeric env values and warns to stderr', async () => {
      const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
      process.env.FS_OP_TIMEOUT_MS = '15s'; // intentionally invalid

      vi.resetModules();
      await import('../lib.js');

      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/Ignoring invalid FS_OP_TIMEOUT_MS="15s"/),
      );
    });

    it('ignores zero/negative values and warns to stderr', async () => {
      const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
      process.env.FS_SEARCH_MAX_VISITED = '0';

      vi.resetModules();
      await import('../lib.js');

      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/Ignoring invalid FS_SEARCH_MAX_VISITED="0"/),
      );
    });
  });
});
