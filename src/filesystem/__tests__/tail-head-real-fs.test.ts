import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { tailFile, headFile } from '../lib.js';

describe('tailFile and headFile (real filesystem)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tail-head-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('tailFile - trailing newline handling', () => {
    it('returns the exact requested number of lines when file has a trailing newline', async () => {
      const filePath = path.join(tmpDir, 'trailing.txt');
      await fs.writeFile(filePath, 'line1\nline2\nline3\n', 'utf-8');

      const result = await tailFile(filePath, 2);
      expect(result).toBe('line2\nline3');
    });

    it('returns the exact requested number of lines when file has NO trailing newline', async () => {
      const filePath = path.join(tmpDir, 'no-trailing.txt');
      await fs.writeFile(filePath, 'line1\nline2\nline3', 'utf-8');

      const result = await tailFile(filePath, 2);
      expect(result).toBe('line2\nline3');
    });

    it('returns all lines if requested count exceeds total lines (with trailing newline)', async () => {
      const filePath = path.join(tmpDir, 'all-trailing.txt');
      await fs.writeFile(filePath, 'line1\nline2\nline3\n', 'utf-8');

      const result = await tailFile(filePath, 5);
      expect(result).toBe('line1\nline2\nline3');
    });

    it('handles CRLF line endings with trailing newline', async () => {
      const filePath = path.join(tmpDir, 'crlf.txt');
      await fs.writeFile(filePath, 'line1\r\nline2\r\nline3\r\n', 'utf-8');

      const result = await tailFile(filePath, 2);
      expect(result).toBe('line2\nline3');
    });

    it('handles single line without trailing newline', async () => {
      const filePath = path.join(tmpDir, 'single.txt');
      await fs.writeFile(filePath, 'hello', 'utf-8');

      const result = await tailFile(filePath, 1);
      expect(result).toBe('hello');
    });

    it('handles single line with trailing newline', async () => {
      const filePath = path.join(tmpDir, 'single-nl.txt');
      await fs.writeFile(filePath, 'hello\n', 'utf-8');

      const result = await tailFile(filePath, 1);
      expect(result).toBe('hello');
    });

    it('handles large file across chunk boundaries with trailing newline', async () => {
      const filePath = path.join(tmpDir, 'large.txt');
      const lines = Array.from({ length: 200 }, (_, i) => `line_${String(i + 1).padStart(3, '0')}`);
      await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');

      const result = await tailFile(filePath, 3);
      expect(result).toBe('line_198\nline_199\nline_200');
    });
  });
});
