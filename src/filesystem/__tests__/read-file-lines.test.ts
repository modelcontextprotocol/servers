import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readFileLines } from '../lib.js';

describe('readFileLines', () => {
  let testDir: string;
  let testFile: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'filesystem-read-lines-test-'));
    testFile = path.join(testDir, 'lines.txt');
    await fs.writeFile(testFile, 'line1\nline2\nline3\nline4\nline5', 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('reads a line range from a zero-based offset', async () => {
    await expect(readFileLines(testFile, 2, 2)).resolves.toBe('line3\nline4');
  });

  it('treats limit without skipped lines as reading from the first line', async () => {
    await expect(readFileLines(testFile, 0, 3)).resolves.toBe('line1\nline2\nline3');
  });

  it('returns an empty string when the limit is zero', async () => {
    await expect(readFileLines(testFile, 2, 0)).resolves.toBe('');
  });

  it('returns an empty string when the offset is past the end of the file', async () => {
    await expect(readFileLines(testFile, 99, 10)).resolves.toBe('');
  });

  it('normalizes CRLF line endings to LF in the returned text', async () => {
    await fs.writeFile(testFile, 'a\r\nb\r\nc\r\n', 'utf-8');
    await expect(readFileLines(testFile, 1, 2)).resolves.toBe('b\nc');
  });
});
