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

    it('should process VS Code Windows file URIs with encoded drive colons', async () => {
      if (process.platform !== 'win32') {
        return;
      }

      const windowsPath = testDir1.replace(/\\/g, '/');
      const encodedDrivePath = windowsPath.replace(/^([a-zA-Z]):/, (_, drive: string) => `${drive.toLowerCase()}%3A`);
      const roots: Root[] = [
        { uri: `file:///${encodedDrivePath}`, name: 'VS Code workspace root' }
      ];

      const result = await getValidRootDirectories(roots);

      expect(result).toContain(testDir1);
      expect(result).toHaveLength(1);
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
