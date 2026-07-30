import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { headFile, tailFile } from '../lib.js';

// These tests use real file I/O (no fs mocking) because the bug exists in the
// interaction between byte-level reads and UTF-8 decoding. The implementation
// reads in 1024-byte chunks, so we construct files where a UTF-8 multi-byte
// character is placed to straddle a chunk boundary at exact byte offsets.

describe('UTF-8 multi-byte character handling at chunk boundaries', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-encoding-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('headFile', () => {
    it('preserves a 3-byte UTF-8 character split across the 1024-byte boundary', async () => {
      // 'あ' (U+3042) is E3 81 82 in UTF-8.
      // 1023 'a' chars (bytes 0..1022) + 'あ' (bytes 1023..1025) + '\n' + 'second\n'.
      // Boundary at offset 1024 falls between 'あ' byte 1 (E3 @ 1023) and byte 2 (81 @ 1024).
      // Buggy version: chunk 1 ends with E3 alone -> U+FFFD; chunk 2 starts with 81 82 -> U+FFFD U+FFFD.
      const file = path.join(tmpDir, 'head-3byte.txt');
      const padding = 'a'.repeat(1023);
      await fs.writeFile(file, `${padding}あ\nsecond line\n`, 'utf-8');

      const result = await headFile(file, 1);

      expect(result).toBe(`${padding}あ`);
      expect(result).not.toContain('\uFFFD');
    });

    it('preserves a 4-byte UTF-8 character split across the 1024-byte boundary', async () => {
      // '😀' (U+1F600) is F0 9F 98 80 in UTF-8.
      // 1022 'a' chars (bytes 0..1021) + '😀' (bytes 1022..1025) straddles the boundary at 1024.
      const file = path.join(tmpDir, 'head-4byte.txt');
      const padding = 'a'.repeat(1022);
      await fs.writeFile(file, `${padding}😀\nsecond line\n`, 'utf-8');

      const result = await headFile(file, 1);

      expect(result).toBe(`${padding}😀`);
      expect(result).not.toContain('\uFFFD');
    });

    it('preserves multi-byte characters across multiple consecutive boundaries', async () => {
      // Three lines, each 1023 bytes of ASCII + 'あ' = 1026 bytes per line + '\n' = 1027.
      // Total ~3081 bytes; boundaries at 1024, 2048, 3072 all fall inside a multi-byte char.
      const file = path.join(tmpDir, 'head-multi-boundary.txt');
      const line = 'a'.repeat(1023) + 'あ';
      await fs.writeFile(file, `${line}\n${line}\n${line}\n`, 'utf-8');

      const result = await headFile(file, 3);

      expect(result).toBe(`${line}\n${line}\n${line}`);
      expect(result).not.toContain('\uFFFD');
    });

    it('returns plain ASCII content correctly (regression)', async () => {
      const file = path.join(tmpDir, 'head-ascii.txt');
      await fs.writeFile(file, 'line1\nline2\nline3\n', 'utf-8');

      expect(await headFile(file, 2)).toBe('line1\nline2');
    });

    it('handles a file without a trailing newline', async () => {
      const file = path.join(tmpDir, 'head-no-trailing.txt');
      await fs.writeFile(file, 'line1\nline2', 'utf-8');

      expect(await headFile(file, 2)).toBe('line1\nline2');
    });
  });

  describe('tailFile', () => {
    it('preserves a 3-byte UTF-8 character split across the boundary measured from EOF', async () => {
      // tailFile reads backwards in 1024-byte chunks from EOF.
      // Construct: 'HEADER\n' + 'a'*100 + 'あ' + 'a'*1017 + '\nLAST'
      //   total = 7 + 100 + 3 + 1017 + 1 + 4 = 1132 bytes
      //   boundary at offset (1132 - 1024) = 108
      //   'あ' bytes at offsets 107 (E3), 108 (81), 109 (82)
      //   chunk 1 (offsets 108..1131) starts with [81, 82, ...]
      //   chunk 2 (offsets 0..107) ends with [..., E3]
      // Buggy version: chunk 1's leading 81 82 decode to U+FFFD U+FFFD;
      //                chunk 2's trailing E3 decodes to U+FFFD.
      const file = path.join(tmpDir, 'tail-3byte.txt');
      const middleBefore = 'a'.repeat(100);
      const middleAfter = 'a'.repeat(1017);
      const content = `HEADER\n${middleBefore}あ${middleAfter}\nLAST`;
      await fs.writeFile(file, content, 'utf-8');

      const result = await tailFile(file, 2);

      expect(result).toBe(`${middleBefore}あ${middleAfter}\nLAST`);
      expect(result).not.toContain('\uFFFD');
    });

    it('preserves a 4-byte UTF-8 character split across the boundary measured from EOF', async () => {
      // '😀' (4 bytes). Place it so 2 bytes lie on each side of the boundary.
      // total = 7 + 100 + 4 + 1016 + 1 + 4 = 1132 bytes; boundary at offset 108
      // '😀' bytes at offsets 107, 108, 109, 110 -> 2 bytes in each chunk.
      const file = path.join(tmpDir, 'tail-4byte.txt');
      const middleBefore = 'a'.repeat(100);
      const middleAfter = 'a'.repeat(1016);
      const content = `HEADER\n${middleBefore}😀${middleAfter}\nLAST`;
      await fs.writeFile(file, content, 'utf-8');

      const result = await tailFile(file, 2);

      expect(result).toBe(`${middleBefore}😀${middleAfter}\nLAST`);
      expect(result).not.toContain('\uFFFD');
    });

    it('returns plain ASCII content correctly (regression)', async () => {
      const file = path.join(tmpDir, 'tail-ascii.txt');
      await fs.writeFile(file, 'line1\nline2\nline3\n', 'utf-8');

      expect(await tailFile(file, 2)).toBe('line3\n');
    });

    it('handles a file without a trailing newline', async () => {
      const file = path.join(tmpDir, 'tail-no-trailing.txt');
      await fs.writeFile(file, 'line1\nline2\nline3', 'utf-8');

      expect(await tailFile(file, 2)).toBe('line2\nline3');
    });

    it('handles an empty file', async () => {
      const file = path.join(tmpDir, 'tail-empty.txt');
      await fs.writeFile(file, '', 'utf-8');

      expect(await tailFile(file, 5)).toBe('');
    });
  });
});
