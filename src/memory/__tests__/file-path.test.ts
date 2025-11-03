import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureMemoryFilePath, defaultMemoryPath } from '../index.js';

describe('ensureMemoryFilePath', () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const oldMemoryPath = path.join(testDir, '..', 'memory.json');
  const newMemoryPath = path.join(testDir, '..', 'memory.jsonl');

  let originalEnv: string | undefined;

  beforeEach(() => {
    // Save original environment variable
    originalEnv = process.env.MEMORY_FILE_PATH;
    // Delete environment variable
    delete process.env.MEMORY_FILE_PATH;
  });

  afterEach(async () => {
    // Restore original environment variable
    if (originalEnv !== undefined) {
      process.env.MEMORY_FILE_PATH = originalEnv;
    } else {
      delete process.env.MEMORY_FILE_PATH;
    }

    // Clean up test files
    try {
      await fs.unlink(oldMemoryPath);
    } catch {
      // Ignore if file doesn't exist
    }
    try {
      await fs.unlink(newMemoryPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('with MEMORY_FILE_PATH environment variable', () => {
    it('should return absolute path when MEMORY_FILE_PATH is absolute', async () => {
      const absolutePath = '/tmp/custom-memory.jsonl';
      process.env.MEMORY_FILE_PATH = absolutePath;

      const result = await ensureMemoryFilePath();

      expect(result).toBe(absolutePath);
    });

    it('should convert relative path to absolute when MEMORY_FILE_PATH is relative', async () => {
      const relativePath = 'custom-memory.jsonl';
      process.env.MEMORY_FILE_PATH = relativePath;

      const result = await ensureMemoryFilePath();

      expect(path.isAbsolute(result)).toBe(true);
      expect(result).toContain('custom-memory.jsonl');
    });

    it('should handle Windows absolute paths', async () => {
      const windowsPath = 'C:\\temp\\memory.jsonl';
      process.env.MEMORY_FILE_PATH = windowsPath;

      const result = await ensureMemoryFilePath();

      // On Windows, should return as-is; on Unix, will be treated as relative
      if (process.platform === 'win32') {
        expect(result).toBe(windowsPath);
      } else {
        expect(path.isAbsolute(result)).toBe(true);
      }
    });
  });

  describe('without MEMORY_FILE_PATH environment variable', () => {
    it('should return default path when no files exist', async () => {
      const result = await ensureMemoryFilePath();

      expect(result).toBe(defaultMemoryPath);
    });

    it('should migrate from memory.json to memory.jsonl when only old file exists', async () => {
      // Create old memory.json file
      await fs.writeFile(oldMemoryPath, '{"test":"data"}');

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await ensureMemoryFilePath();

      expect(result).toBe(defaultMemoryPath);

      // Verify migration happened
      const newFileExists = await fs.access(newMemoryPath).then(() => true).catch(() => false);
      const oldFileExists = await fs.access(oldMemoryPath).then(() => true).catch(() => false);

      expect(newFileExists).toBe(true);
      expect(oldFileExists).toBe(false);

      // Verify console messages
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DETECTED: Found legacy memory.json file')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('COMPLETED: Successfully migrated')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should use new file when both old and new files exist', async () => {
      // Create both files
      await fs.writeFile(oldMemoryPath, '{"old":"data"}');
      await fs.writeFile(newMemoryPath, '{"new":"data"}');

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await ensureMemoryFilePath();

      expect(result).toBe(defaultMemoryPath);

      // Verify no migration happened (both files should still exist)
      const newFileExists = await fs.access(newMemoryPath).then(() => true).catch(() => false);
      const oldFileExists = await fs.access(oldMemoryPath).then(() => true).catch(() => false);

      expect(newFileExists).toBe(true);
      expect(oldFileExists).toBe(true);

      // Verify no console messages about migration
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should preserve file content during migration', async () => {
      const testContent = '{"entities": [{"name": "test", "type": "person"}]}';
      await fs.writeFile(oldMemoryPath, testContent);

      await ensureMemoryFilePath();

      const migratedContent = await fs.readFile(newMemoryPath, 'utf-8');
      expect(migratedContent).toBe(testContent);
    });
  });

  describe('defaultMemoryPath', () => {
    it('should end with memory.jsonl', () => {
      expect(defaultMemoryPath).toMatch(/memory\.jsonl$/);
    });

    it('should be an absolute path', () => {
      expect(path.isAbsolute(defaultMemoryPath)).toBe(true);
    });
  });
});
