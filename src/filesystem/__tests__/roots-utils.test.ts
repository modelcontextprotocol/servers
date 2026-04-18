import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getValidRootDirectories } from '../roots-utils.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Root } from '@modelcontextprotocol/sdk/types.js';

describe('getValidRootDirectories', () => {
  let testDir1: string;
  let testDir2: string;
  let testDir3: string;
  let testFile: string;

  beforeEach(() => {
    // Create test directories
    testDir1 = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-roots-test1-')));
    testDir2 = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-roots-test2-')));
    testDir3 = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-roots-test3-')));

    // Create a test file (not a directory)
    testFile = join(testDir1, 'test-file.txt');
    writeFileSync(testFile, 'test content');
  });

  afterEach(() => {
    // Cleanup
    rmSync(testDir1, { recursive: true, force: true });
    rmSync(testDir2, { recursive: true, force: true });
    rmSync(testDir3, { recursive: true, force: true });
  });

  describe('valid directory processing', () => {
    it('should process all URI formats and edge cases', async () => {
      const roots = [
        { uri: `file://${testDir1}`, name: 'File URI' },
        { uri: testDir2, name: 'Plain path' },
        { uri: testDir3 } // Plain path without name property
      ];

      const result = await getValidRootDirectories(roots);

      expect(result).toContain(testDir1);
      expect(result).toContain(testDir2);
      expect(result).toContain(testDir3);
      expect(result).toHaveLength(3);
    });

    it('should normalize complex paths', async () => {
      const subDir = join(testDir1, 'subdir');
      mkdirSync(subDir);
      
      const roots = [
        { uri: `file://${testDir1}/./subdir/../subdir`, name: 'Complex Path' }
      ];

      const result = await getValidRootDirectories(roots);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(subDir);
    });
  });

  describe('tilde path handling', () => {
    let tildeDirParent: string;
    let tildeDir: string;

    beforeEach(() => {
      // Create a directory with a literal tilde in its name
      tildeDirParent = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-tilde-test-')));
      tildeDir = join(tildeDirParent, '~MyFolder');
      mkdirSync(tildeDir);
    });

    afterEach(() => {
      rmSync(tildeDirParent, { recursive: true, force: true });
    });

    it('should handle directories with literal tilde in name via file URI', async () => {
      const roots: Root[] = [
        { uri: `file://${tildeDir}`, name: 'Tilde Dir' }
      ];

      const result = await getValidRootDirectories(roots);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(tildeDir);
    });

    it('should handle directories with literal tilde in name via plain path', async () => {
      const roots: Root[] = [
        { uri: tildeDir, name: 'Tilde Dir' }
      ];

      const result = await getValidRootDirectories(roots);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(tildeDir);
    });

    it('should handle file URI with tilde in authority position gracefully', async () => {
      // file://~/path is malformed (~ becomes the host), should not crash
      const roots: Root[] = [
        { uri: `file://~/some/path`, name: 'Bad URI' },
        { uri: `file://${tildeDir}`, name: 'Good URI' }
      ];

      const result = await getValidRootDirectories(roots);
      // The malformed URI should be skipped, the valid one should work
      expect(result).toContain(tildeDir);
    });

    it('should handle multiple directories with tildes', async () => {
      const tildeDir2 = join(tildeDirParent, '~AnotherFolder');
      mkdirSync(tildeDir2);

      const roots: Root[] = [
        { uri: `file://${tildeDir}`, name: 'Tilde Dir 1' },
        { uri: `file://${tildeDir2}`, name: 'Tilde Dir 2' }
      ];

      const result = await getValidRootDirectories(roots);
      expect(result).toHaveLength(2);
      expect(result).toContain(tildeDir);
      expect(result).toContain(tildeDir2);
    });
  });

  describe('error handling', () => {

    it('should handle various error types', async () => {
      const nonExistentDir = join(tmpdir(), 'non-existent-directory-12345');
      const invalidPath = '\0invalid\0path'; // Null bytes cause different error types
      const roots = [
        { uri: `file://${testDir1}`, name: 'Valid Dir' },
        { uri: `file://${nonExistentDir}`, name: 'Non-existent Dir' },
        { uri: `file://${testFile}`, name: 'File Not Dir' },
        { uri: `file://${invalidPath}`, name: 'Invalid Path' }
      ];

      const result = await getValidRootDirectories(roots);

      expect(result).toContain(testDir1);
      expect(result).not.toContain(nonExistentDir);
      expect(result).not.toContain(testFile);
      expect(result).not.toContain(invalidPath);
      expect(result).toHaveLength(1);
    });
  });
});