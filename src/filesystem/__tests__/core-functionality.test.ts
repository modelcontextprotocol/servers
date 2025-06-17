import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Core Filesystem Functionality', () => {
  let tempDir: string;
  let testFile: string;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'filesystem-core-test-'));
    testFile = path.join(tempDir, 'test.txt');
    testDir = path.join(tempDir, 'testdir');
  });

  afterEach(async () => {
    // Clean up temporary files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Core File Operations', () => {
    it('should read a simple text file', async () => {
      const content = 'Hello, world!\nThis is a test file.';
      await fs.writeFile(testFile, content);

      const readContent = await fs.readFile(testFile, 'utf-8');
      expect(readContent).toBe(content);
    });

    it('should write and create a file', async () => {
      const content = 'This is test content for writing.';
      
      // Write file
      await fs.writeFile(testFile, content);
      
      // Verify it was written correctly
      const readContent = await fs.readFile(testFile, 'utf-8');
      expect(readContent).toBe(content);
      
      // Verify file exists
      const stats = await fs.stat(testFile);
      expect(stats.isFile()).toBe(true);
    });

    it('should create a directory', async () => {
      // Create directory
      await fs.mkdir(testDir);
      
      // Verify directory was created
      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should list directory contents', async () => {
      // Create test directory and files
      await fs.mkdir(testDir);
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content2');
      await fs.mkdir(path.join(testDir, 'subdir'));

      // List directory contents
      const entries = await fs.readdir(testDir, { withFileTypes: true });
      
      expect(entries.length).toBe(3);
      
      const names = entries.map(e => e.name).sort();
      expect(names).toEqual(['file1.txt', 'file2.txt', 'subdir']);
      
      // Verify types
      const files = entries.filter(e => e.isFile()).map(e => e.name).sort();
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      
      expect(files).toEqual(['file1.txt', 'file2.txt']);
      expect(dirs).toEqual(['subdir']);
    });

    it('should get file info and metadata', async () => {
      const content = 'Test content for file info';
      await fs.writeFile(testFile, content);

      const stats = await fs.stat(testFile);
      
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.size).toBe(content.length);
      expect(stats.mtime).toBeDefined();
      expect(stats.birthtime).toBeDefined();
      expect(typeof stats.mtime.getTime()).toBe('number');
      expect(typeof stats.birthtime.getTime()).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle reading non-existent file', async () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.txt');
      
      await expect(fs.readFile(nonExistentFile, 'utf-8')).rejects.toThrow();
    });

    it('should handle writing to invalid path', async () => {
      // Try to write to a path that doesn't exist (parent directory missing)
      const invalidPath = path.join(tempDir, 'nonexistent', 'subdir', 'file.txt');
      
      await expect(fs.writeFile(invalidPath, 'content')).rejects.toThrow();
    });

    it('should handle listing non-existent directory', async () => {
      const nonExistentDir = path.join(tempDir, 'does-not-exist');
      
      await expect(fs.readdir(nonExistentDir)).rejects.toThrow();
    });
  });
});
