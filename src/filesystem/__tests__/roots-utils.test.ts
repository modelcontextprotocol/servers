import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getValidRootDirectories } from '../roots-utils.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Root } from '@modelcontextprotocol/sdk/types.js';
import { pathToFileURL } from 'url';
import { realpath as realpathAsync } from 'fs/promises';

describe('getValidRootDirectories', () => {
  let testDir1: string;
  let testDir2: string;
  let testDir3: string;
  let testFile: string;

  beforeEach(() => {
    // Create test directories
    // Avoid depending on Windows 8.3 short path behavior differences between
    // realpath sync/async implementations.
    testDir1 = mkdtempSync(join(tmpdir(), 'mcp-roots-test1-'));
    testDir2 = mkdtempSync(join(tmpdir(), 'mcp-roots-test2-'));
    testDir3 = mkdtempSync(join(tmpdir(), 'mcp-roots-test3-'));

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
        { uri: pathToFileURL(testDir1).href, name: 'File URI' },
        { uri: testDir2, name: 'Plain path' },
        { uri: testDir3 } // Plain path without name property
      ];

      const result = await getValidRootDirectories(roots);
      const resolved = await Promise.all(result.map(p => realpathAsync(p)));
      const expected1 = await realpathAsync(testDir1);
      const expected2 = await realpathAsync(testDir2);
      const expected3 = await realpathAsync(testDir3);

      expect(resolved).toContain(expected1);
      expect(resolved).toContain(expected2);
      expect(resolved).toContain(expected3);
      expect(resolved).toHaveLength(3);
    });

    it('should normalize complex paths', async () => {
      const subDir = join(testDir1, 'subdir');
      mkdirSync(subDir);
      
      const roots = [
        { uri: pathToFileURL(join(testDir1, './subdir/../subdir')).href, name: 'Complex Path' }
      ];

      const result = await getValidRootDirectories(roots);

      expect(result).toHaveLength(1);
      expect(await realpathAsync(result[0])).toBe(await realpathAsync(subDir));
    });
  });

  describe('error handling', () => {

    it('should handle various error types', async () => {
      const nonExistentDir = join(tmpdir(), 'non-existent-directory-12345');
      const invalidPath = '\0invalid\0path'; // Null bytes cause different error types
      const roots = [
        { uri: pathToFileURL(testDir1).href, name: 'Valid Dir' },
        { uri: pathToFileURL(nonExistentDir).href, name: 'Non-existent Dir' },
        { uri: pathToFileURL(testFile).href, name: 'File Not Dir' },
        { uri: `file://${invalidPath}`, name: 'Invalid Path' }
      ];

      const result = await getValidRootDirectories(roots);

      expect(await Promise.all(result.map(p => realpathAsync(p)))).toContain(await realpathAsync(testDir1));
      expect(result).not.toContain(nonExistentDir);
      expect(result).not.toContain(testFile);
      expect(result).not.toContain(invalidPath);
      expect(result).toHaveLength(1);
    });
  });
});