import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyFileEdits, writeFileContent } from '../lib.js';

// Regression coverage for #4512. These run against the real filesystem rather
// than mocks, because the property under test - that the inode survives a
// write - is precisely what a mocked fs cannot demonstrate.
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describePosix('write_file / edit_file preserve file identity', () => {
  let testDirectory: string;
  let target: string;

  beforeEach(async () => {
    testDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-write-identity-'));
    target = path.join(testDirectory, 'note.txt');
    await fs.writeFile(target, 'line1\nline2\nline3\n', 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(testDirectory, { recursive: true, force: true });
  });

  it('writeFileContent keeps the inode, birthtime and permission bits', async () => {
    await fs.chmod(target, 0o755);
    const before = await fs.stat(target);

    await writeFileContent(target, 'replaced content\n');

    const after = await fs.stat(target);
    expect(after.ino).toBe(before.ino);
    expect(after.birthtimeMs).toBe(before.birthtimeMs);
    expect(after.mode & 0o777).toBe(0o755);
    expect(await fs.readFile(target, 'utf-8')).toBe('replaced content\n');
  });

  it('applyFileEdits keeps the inode, birthtime and permission bits', async () => {
    await fs.chmod(target, 0o644);
    const before = await fs.stat(target);

    await applyFileEdits(target, [{ oldText: 'line2', newText: 'edited line2' }], false);

    const after = await fs.stat(target);
    expect(after.ino).toBe(before.ino);
    expect(after.birthtimeMs).toBe(before.birthtimeMs);
    expect(after.mode & 0o777).toBe(0o644);
    expect(await fs.readFile(target, 'utf-8')).toBe('line1\nedited line2\nline3\n');
  });

  it('keeps hard links intact across a write', async () => {
    const link = path.join(testDirectory, 'note-link.txt');
    await fs.link(target, link);

    await writeFileContent(target, 'shared update\n');

    // A temp+rename write would have severed the link, leaving the old content.
    expect(await fs.readFile(link, 'utf-8')).toBe('shared update\n');
    expect((await fs.stat(link)).ino).toBe((await fs.stat(target)).ino);
  });

  it('rejects a symlinked target instead of silently replacing the link', async () => {
    const secret = path.join(testDirectory, 'secret.txt');
    await fs.writeFile(secret, 'do not clobber\n', 'utf-8');
    const trap = path.join(testDirectory, 'trap.txt');
    await fs.symlink(secret, trap);

    // O_NOFOLLOW fails with ELOOP rather than writing through the link.
    await expect(writeFileContent(trap, 'attacker content\n')).rejects.toThrow();

    // The link target was never written to - the same guarantee the temp+rename
    // strategy gave - but the symlink itself also survives. rename() kept the
    // target safe only by clobbering the link with a regular file, which is the
    // same loss of file identity this change exists to stop.
    expect(await fs.readFile(secret, 'utf-8')).toBe('do not clobber\n');
    expect((await fs.lstat(trap)).isSymbolicLink()).toBe(true);
  });
});
