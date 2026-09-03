/**
 * Tests for Issue #2219 — hidden file filtering in searchFilesWithValidation.
 *
 * Uses vi.mock('fs/promises') exactly like lib.test.ts does, so all fs calls
 * are controlled and there is no real-filesystem I/O.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import * as path from 'path';
import { searchFilesWithValidation, setAllowedDirectories } from '../lib.js';

vi.mock('fs/promises');
const mockFs = fs as any;

const testDir = '/allowed/project';
const allowedDirs = ['/allowed'];

describe('searchFilesWithValidation — hidden file filtering (Issue #2219)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAllowedDirectories(allowedDirs);
    mockFs.realpath.mockImplementation(async (p: string) => p);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setAllowedDirectories([]);
  });

  it('excludes dot-prefixed files and directories by default (no includeHidden option)', async () => {
    mockFs.readdir.mockResolvedValueOnce([
      { name: 'src',         isDirectory: () => true  },
      { name: 'visible.txt', isDirectory: () => false },
      { name: '.git',        isDirectory: () => true  },
      { name: '.env',        isDirectory: () => false },
    ]);

    const results = await searchFilesWithValidation(testDir, '**/*', allowedDirs);
    const names = results.map(r => path.basename(r));

    expect(names).toContain('visible.txt');
    expect(names).not.toContain('.git');
    expect(names).not.toContain('.env');
  });

  it('excludes dot-prefixed entries when includeHidden is explicitly false', async () => {
    mockFs.readdir.mockResolvedValueOnce([
      { name: 'README.md',  isDirectory: () => false },
      { name: '.terraform', isDirectory: () => true  },
    ]);

    const results = await searchFilesWithValidation(
      testDir, '**/*', allowedDirs, { includeHidden: false },
    );
    const names = results.map(r => path.basename(r));

    expect(names).toContain('README.md');
    expect(names).not.toContain('.terraform');
  });

  it('does not recurse into hidden directories when includeHidden is false', async () => {
    mockFs.readdir.mockResolvedValueOnce([
      { name: '.git', isDirectory: () => true },
    ]);

    const results = await searchFilesWithValidation(
      testDir, '**/HEAD', allowedDirs, { includeHidden: false },
    );

    expect(results).toHaveLength(0);
    // readdir must have been called only once (for rootPath); .git was never entered
    expect(mockFs.readdir).toHaveBeenCalledTimes(1);
  });

  it('includes hidden files and directories when includeHidden is true', async () => {
    mockFs.readdir
      // Root level
      .mockResolvedValueOnce([
        { name: 'visible.txt', isDirectory: () => false },
        { name: '.git',        isDirectory: () => true  },
        { name: '.env',        isDirectory: () => false },
      ])
      // .git children (recursive call)
      .mockResolvedValueOnce([
        { name: 'HEAD', isDirectory: () => false },
      ]);

    const results = await searchFilesWithValidation(
      testDir, '**/*', allowedDirs, { includeHidden: true },
    );
    const names = results.map(r => path.basename(r));

    expect(names).toContain('visible.txt');
    expect(names).toContain('.git');
    expect(names).toContain('HEAD');   // traversal must have entered .git
    expect(names).toContain('.env');
  });
});
