import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setAllowedDirectories, validatePath } from '../lib.js';

describe('a symlink with no target', () => {
  let testDirectory: string;

  beforeEach(async () => {
    testDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-broken-symlink-'));
    setAllowedDirectories([testDirectory]);
  });

  afterEach(async () => {
    setAllowedDirectories([]);
    await fs.rm(testDirectory, { recursive: true, force: true });
  });

  it('is named as such, not as a missing parent directory', async () => {
    const link = path.join(testDirectory, 'link.txt');
    await fs.symlink(path.join(testDirectory, 'gone.txt'), link);

    await expect(validatePath(link)).rejects.toThrow(/Broken symlink/);
    // the parent is right there, so the old message pointed at the wrong thing
    await expect(fs.stat(testDirectory)).resolves.toBeDefined();
  });

  it('does not change what a genuinely missing path reports', async () => {
    const missing = path.join(testDirectory, 'nope', 'file.txt');

    // resolveUnicodeEquivalentPath returns the tail so create_directory can
    // mkdir -p it; that is unrelated to the broken-symlink case.
    await expect(validatePath(missing)).resolves.toBe(
      path.join(await fs.realpath(testDirectory), 'nope', 'file.txt'),
    );
  });
});
