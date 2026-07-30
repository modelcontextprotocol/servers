
import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileContent, applyFileEdits, setAllowedDirectories } from '../lib.js';
import { stat, mkdtemp, writeFile as fsWriteFile, copyFile, link, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Real filesystem birthtime preservation (#4512)', () => {
  let testDir: string;
  let testPath: string;
  let hardlinkPath: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mcp-birthtime-'));
    testPath = join(testDir, 'file.txt');
    hardlinkPath = join(testDir, 'hardlink.txt');
    setAllowedDirectories([testDir]);
  });

  it('writeFileContent preserves birthtime and inode', async () => {
    // Create initial file
    await writeFileContent(testPath, 'initial');
    const before = await stat(testPath);
    await new Promise(r => setTimeout(r, 1500));

    // Write again — pre-fix this would destroy birthtime and inode
    await writeFileContent(testPath, 'updated');

    const after = await stat(testPath);
    expect(after.birthtimeMs).toBe(before.birthtimeMs);
    expect(after.ino).toBe(before.ino);
    expect(after.nlink).toBe(before.nlink);
  });

  it('writeFileContent preserves hard links', async () => {
    await writeFileContent(testPath, 'initial');
    // Create a hard link to the same inode
    await link(testPath, hardlinkPath);
    const before = await stat(testPath);
    expect(before.nlink).toBe(2);

    await new Promise(r => setTimeout(r, 1500));
    await writeFileContent(testPath, 'updated');

    const after = await stat(testPath);
    expect(after.nlink).toBe(2);  // Hard link should still be valid
    expect(after.ino).toBe(before.ino);

    // The hardlinked file should still be readable
    const { readFile } = await import('fs/promises');
    const hardContent = await readFile(hardlinkPath, 'utf-8');
    expect(hardContent).toBe('updated');  // Both names point to same inode with new content
  });

  it('applyFileEdits preserves birthtime and inode', async () => {
    await writeFileContent(testPath, 'line1\nline2\nline3\n');
    const before = await stat(testPath);
    await new Promise(r => setTimeout(r, 1500));

    await applyFileEdits(testPath, [{ oldText: 'line2', newText: 'modified' }], false);

    const after = await stat(testPath);
    expect(after.birthtimeMs).toBe(before.birthtimeMs);
    expect(after.ino).toBe(before.ino);
  });
});
