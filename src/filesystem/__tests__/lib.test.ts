import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  // Pure utility functions
  formatSize,
  normalizeLineEndings,
  createUnifiedDiff,
  // Security & validation functions
  validatePath,
  setAllowedDirectories,
  // File operations
  getFileStats,
  readFileContent,
  writeFileContent,
  moveFile,
  // Search & filtering functions
  searchFilesWithValidation,
  // File editing functions
  applyFileEdits,
  tailFile,
  headFile
} from '../lib.js';

// Mock fs module
vi.mock('fs/promises');
const mockFs = fs as any;

function createMockFileHandle(content: Buffer) {
  return {
    read: vi.fn(
      async (buffer: Buffer, offset: number, length: number, position: number) => {
        const bytesRead = content.copy(
          buffer,
          offset,
          position,
          Math.min(position + length, content.length),
        );
        return { bytesRead, buffer };
      },
    ),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Lib Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up allowed directories for tests
    const allowedDirs = process.platform === 'win32' ? ['C:\\Users\\test', 'C:\\temp', 'C:\\allowed'] : ['/home/user', '/tmp', '/allowed'];
    setAllowedDirectories(allowedDirs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clear allowed directories after tests
    setAllowedDirectories([]);
  });

  describe('Pure Utility Functions', () => {
    describe('formatSize', () => {
      it('formats bytes correctly', () => {
        expect(formatSize(0)).toBe('0 B');
        expect(formatSize(512)).toBe('512 B');
        expect(formatSize(1024)).toBe('1.00 KB');
        expect(formatSize(1536)).toBe('1.50 KB');
        expect(formatSize(1048576)).toBe('1.00 MB');
        expect(formatSize(1073741824)).toBe('1.00 GB');
        expect(formatSize(1099511627776)).toBe('1.00 TB');
      });

      it('handles edge cases', () => {
        expect(formatSize(1023)).toBe('1023 B');
        expect(formatSize(1025)).toBe('1.00 KB');
        expect(formatSize(1048575)).toBe('1024.00 KB');
      });

      it('handles very large numbers beyond TB', () => {
        // The function only supports up to TB, so very large numbers will show as TB
        expect(formatSize(1024 * 1024 * 1024 * 1024 * 1024)).toBe('1024.00 TB');
        expect(formatSize(Number.MAX_SAFE_INTEGER)).toContain('TB');
      });

      it('handles negative numbers', () => {
        // Negative numbers should return '0 B' as file sizes cannot be negative
        expect(formatSize(-1)).toBe('0 B');
        expect(formatSize(-1024)).toBe('0 B');
        expect(formatSize(-1000000)).toBe('0 B');
        expect(formatSize(-0)).toBe('0 B');
      });

      it('handles decimal numbers', () => {
        expect(formatSize(1536.5)).toBe('1.50 KB');
        expect(formatSize(1023.9)).toBe('1023.9 B');
      });

      it('handles very small positive numbers', () => {
        expect(formatSize(1)).toBe('1 B');
        expect(formatSize(0.5)).toBe('0.5 B');
        expect(formatSize(0.1)).toBe('0.1 B');
      });
    });

    describe('normalizeLineEndings', () => {
      it('converts CRLF to LF', () => {
        expect(normalizeLineEndings('line1\r\nline2\r\nline3')).toBe('line1\nline2\nline3');
      });

      it('leaves LF unchanged', () => {
        expect(normalizeLineEndings('line1\nline2\nline3')).toBe('line1\nline2\nline3');
      });

      it('handles mixed line endings', () => {
        expect(normalizeLineEndings('line1\r\nline2\nline3\r\n')).toBe('line1\nline2\nline3\n');
      });

      it('handles empty string', () => {
        expect(normalizeLineEndings('')).toBe('');
      });
    });

    describe('createUnifiedDiff', () => {
      it('creates diff for simple changes', () => {
        const original = 'line1\nline2\nline3';
        const modified = 'line1\nmodified line2\nline3';
        const diff = createUnifiedDiff(original, modified, 'test.txt');
        
        expect(diff).toContain('--- test.txt');
        expect(diff).toContain('+++ test.txt');
        expect(diff).toContain('-line2');
        expect(diff).toContain('+modified line2');
      });

      it('handles CRLF normalization', () => {
        const original = 'line1\r\nline2\r\n';
        const modified = 'line1\nmodified line2\n';
        const diff = createUnifiedDiff(original, modified);
        
        expect(diff).toContain('-line2');
        expect(diff).toContain('+modified line2');
      });

      it('handles identical content', () => {
        const content = 'line1\nline2\nline3';
        const diff = createUnifiedDiff(content, content);
        
        // Should not contain any +/- lines for identical content (excluding header lines)
        expect(diff.split('\n').filter((line: string) => line.startsWith('+++') || line.startsWith('---'))).toHaveLength(2);
        expect(diff.split('\n').filter((line: string) => line.startsWith('+') && !line.startsWith('+++'))).toHaveLength(0);
        expect(diff.split('\n').filter((line: string) => line.startsWith('-') && !line.startsWith('---'))).toHaveLength(0);
      });

      it('handles empty content', () => {
        const diff = createUnifiedDiff('', '');
        expect(diff).toContain('--- file');
        expect(diff).toContain('+++ file');
      });

      it('handles default filename parameter', () => {
        const diff = createUnifiedDiff('old', 'new');
        expect(diff).toContain('--- file');
        expect(diff).toContain('+++ file');
      });

      it('handles custom filename', () => {
        const diff = createUnifiedDiff('old', 'new', 'custom.txt');
        expect(diff).toContain('--- custom.txt');
        expect(diff).toContain('+++ custom.txt');
      });
    });
  });

  describe('Security & Validation Functions', () => {
    describe('validatePath', () => {
      it('rejects Windows drive paths on POSIX hosts', async () => {
        if (process.platform === 'win32') return;

        await expect(validatePath('C:\\Users\\me\\notes\\file.md'))
          .rejects.toThrow('Windows-style path received on a POSIX host');
      });

      // Use Windows-compatible paths for testing
      const allowedDirs = process.platform === 'win32' ? ['C:\\Users\\test', 'C:\\temp'] : ['/home/user', '/tmp'];

      beforeEach(() => {
        mockFs.realpath.mockImplementation(async (path: any) => path.toString());
      });

      it('validates allowed paths', async () => {
        const testPath = process.platform === 'win32' ? 'C:\\Users\\test\\file.txt' : '/home/user/file.txt';
        const result = await validatePath(testPath);
        expect(result).toBe(testPath);
      });

      it('rejects disallowed paths', async () => {
        const testPath = process.platform === 'win32' ? 'C:\\Windows\\System32\\file.txt' : '/etc/passwd';
        await expect(validatePath(testPath))
          .rejects.toThrow('Access denied - path outside allowed directories');
      });

      it('handles non-existent files by checking parent directory', async () => {
        const newFilePath = process.platform === 'win32' ? 'C:\\Users\\test\\newfile.txt' : '/home/user/newfile.txt';
        const parentPath = process.platform === 'win32' ? 'C:\\Users\\test' : '/home/user';
        
        // Create an error with the ENOENT code that the implementation checks for
        const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
        enoentError.code = 'ENOENT';
        
        mockFs.realpath
          .mockRejectedValueOnce(enoentError)
          .mockResolvedValueOnce(parentPath);
        
        const result = await validatePath(newFilePath);
        expect(result).toBe(path.resolve(newFilePath));
      });

      it('walks past multiple missing ancestors to an existing allowed directory', async () => {
        // e.g. create_directory('/home/user/nonexistent/nested/newfile.txt') when
        // neither 'nonexistent' nor 'nonexistent/nested' exist yet, but '/home/user'
        // (an allowed directory) does. Regression test for #4629.
        const newFilePath = process.platform === 'win32' ? 'C:\\Users\\test\\nonexistent\\nested\\newfile.txt' : '/home/user/nonexistent/nested/newfile.txt';

        const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
        enoentError.code = 'ENOENT';

        // The path itself is missing. The resolver then realpaths the allowed
        // directory ('/home/user'), which falls through to the beforeEach base
        // implementation and echoes the path back as-is. readdir is mocked to
        // undefined, so every component below it counts as missing.
        mockFs.realpath.mockRejectedValueOnce(enoentError);

        const result = await validatePath(newFilePath);
        expect(result).toBe(path.resolve(newFilePath));
      });

      it('rejects when no ancestor directory exists at all', async () => {
        const newFilePath = process.platform === 'win32' ? 'C:\\Users\\test\\nonexistent\\newfile.txt' : '/home/user/nonexistent/newfile.txt';

        const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
        enoentError.code = 'ENOENT';

        // Every ancestor, all the way up to the filesystem root, is missing.
        mockFs.realpath.mockRejectedValue(enoentError);

        await expect(validatePath(newFilePath))
          .rejects.toThrow('Parent directory does not exist');
      });

      it('resolves relative paths against allowed directories instead of process.cwd()', async () => {
        const relativePath = 'test-file.txt';
        const originalCwd = process.cwd;
        
        // Mock process.cwd to return a directory outside allowed directories
        const disallowedCwd = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/root';
        (process as any).cwd = vi.fn(() => disallowedCwd);
        
        try {
          const result = await validatePath(relativePath);
          
          // Result should be resolved against first allowed directory, not process.cwd()
          const expectedPath = process.platform === 'win32' 
            ? path.resolve('C:\\Users\\test', relativePath)
            : path.resolve('/home/user', relativePath);
          
          expect(result).toBe(expectedPath);
          expect(result).not.toContain(disallowedCwd);
        } finally {
          // Restore original process.cwd
          process.cwd = originalCwd;
        }
      });
    });
  });

  describe('File Operations', () => {
    describe('getFileStats', () => {
      it('returns file statistics', async () => {
        const mockStats = {
          size: 1024,
          birthtime: new Date('2023-01-01'),
          mtime: new Date('2023-01-02'),
          atime: new Date('2023-01-03'),
          isDirectory: () => false,
          isFile: () => true,
          mode: 0o644
        };
        
        mockFs.stat.mockResolvedValueOnce(mockStats as any);
        
        const result = await getFileStats('/test/file.txt');
        
        expect(result).toEqual({
          size: 1024,
          created: new Date('2023-01-01'),
          modified: new Date('2023-01-02'),
          accessed: new Date('2023-01-03'),
          isDirectory: false,
          isFile: true,
          permissions: '644'
        });
      });

      it('handles directory statistics', async () => {
        const mockStats = {
          size: 4096,
          birthtime: new Date('2023-01-01'),
          mtime: new Date('2023-01-02'),
          atime: new Date('2023-01-03'),
          isDirectory: () => true,
          isFile: () => false,
          mode: 0o755
        };
        
        mockFs.stat.mockResolvedValueOnce(mockStats as any);
        
        const result = await getFileStats('/test/dir');
        
        expect(result.isDirectory).toBe(true);
        expect(result.isFile).toBe(false);
        expect(result.permissions).toBe('755');
      });
    });

    describe('readFileContent', () => {
      it('reads file with default encoding', async () => {
        mockFs.readFile.mockResolvedValueOnce('file content');
        
        const result = await readFileContent('/test/file.txt');
        
        expect(result).toBe('file content');
        expect(mockFs.readFile).toHaveBeenCalledWith('/test/file.txt', 'utf-8');
      });

      it('reads file with custom encoding', async () => {
        mockFs.readFile.mockResolvedValueOnce('file content');
        
        const result = await readFileContent('/test/file.txt', 'ascii');
        
        expect(result).toBe('file content');
        expect(mockFs.readFile).toHaveBeenCalledWith('/test/file.txt', 'ascii');
      });
    });

    describe('writeFileContent', () => {
      it('writes file content', async () => {
        mockFs.writeFile.mockResolvedValueOnce(undefined);
        
        await writeFileContent('/test/file.txt', 'new content');
        
        expect(mockFs.writeFile).toHaveBeenCalledWith('/test/file.txt', 'new content', { encoding: "utf-8", flag: 'wx' });
      });

      it('preserves file permissions when overwriting existing file', async () => {
        // First writeFile call with 'wx' flag fails because file exists
        mockFs.writeFile.mockRejectedValueOnce(Object.assign(new Error('EEXIST'), { code: 'EEXIST' }));
        // stat returns executable permissions
        mockFs.stat.mockResolvedValueOnce({ mode: 0o100755 });
        // Second writeFile (to temp) succeeds
        mockFs.writeFile.mockResolvedValueOnce(undefined);
        mockFs.rename.mockResolvedValueOnce(undefined);
        mockFs.chmod.mockResolvedValueOnce(undefined);

        await writeFileContent('/test/script.sh', 'new content');

        expect(mockFs.stat).toHaveBeenCalledWith('/test/script.sh');
        expect(mockFs.chmod).toHaveBeenCalledWith('/test/script.sh', 0o755);
      });

      it('does not fail the write when chmod fails', async () => {
        mockFs.writeFile.mockRejectedValueOnce(Object.assign(new Error('EEXIST'), { code: 'EEXIST' }));
        mockFs.stat.mockResolvedValueOnce({ mode: 0o100755 });
        mockFs.writeFile.mockResolvedValueOnce(undefined);
        mockFs.rename.mockResolvedValueOnce(undefined);
        mockFs.chmod.mockRejectedValueOnce(Object.assign(new Error('EPERM'), { code: 'EPERM' }));

        await expect(writeFileContent('/test/script.sh', 'new content')).resolves.toBeUndefined();
        expect(mockFs.unlink).not.toHaveBeenCalled();
      });
    });

    describe('moveFile', () => {
      it('moves the file when the destination does not exist', async () => {
        const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
        mockFs.lstat.mockRejectedValueOnce(enoent);
        mockFs.rename.mockResolvedValueOnce(undefined);

        await moveFile('/test/source.txt', '/test/dest.txt');

        expect(mockFs.rename).toHaveBeenCalledWith('/test/source.txt', '/test/dest.txt');
      });

      it('fails without overwriting when the destination already exists', async () => {
        // lstat resolving means the destination is occupied.
        mockFs.lstat.mockResolvedValueOnce({} as any);

        await expect(moveFile('/test/source.txt', '/test/dest.txt')).rejects.toThrow(
          'Destination already exists'
        );

        expect(mockFs.rename).not.toHaveBeenCalled();
      });
    });

  });

  describe('Search & Filtering Functions', () => {
    describe('searchFilesWithValidation', () => {
      beforeEach(() => {
        mockFs.realpath.mockImplementation(async (path: any) => path.toString());
      });


      it('excludes files matching exclude patterns', async () => {
        const mockEntries = [
          { name: 'test.txt', isDirectory: () => false },
          { name: 'test.log', isDirectory: () => false },
          { name: 'node_modules', isDirectory: () => true }
        ];
        
        mockFs.readdir.mockResolvedValueOnce(mockEntries as any);
        
        const testDir = process.platform === 'win32' ? 'C:\\allowed\\dir' : '/allowed/dir';
        const allowedDirs = process.platform === 'win32' ? ['C:\\allowed'] : ['/allowed'];
        
        // Mock realpath to return the same path for validation to pass
        mockFs.realpath.mockImplementation(async (inputPath: any) => {
          const pathStr = inputPath.toString();
          // Return the path as-is for validation
          return pathStr;
        });
        
        const result = await searchFilesWithValidation(
          testDir,
          '*test*',
          allowedDirs,
          { excludePatterns: ['*.log', 'node_modules'] }
        );
        
        const expectedResult = process.platform === 'win32' ? 'C:\\allowed\\dir\\test.txt' : '/allowed/dir/test.txt';
        expect(result).toEqual([expectedResult]);
      });

      it('handles validation errors during search', async () => {
        const mockEntries = [
          { name: 'test.txt', isDirectory: () => false },
          { name: 'invalid_file.txt', isDirectory: () => false }
        ];
        
        mockFs.readdir.mockResolvedValueOnce(mockEntries as any);
        
        // Mock validatePath to throw error for invalid_file.txt
        mockFs.realpath.mockImplementation(async (path: any) => {
          if (path.toString().includes('invalid_file.txt')) {
            throw new Error('Access denied');
          }
          return path.toString();
        });
        
        const testDir = process.platform === 'win32' ? 'C:\\allowed\\dir' : '/allowed/dir';
        const allowedDirs = process.platform === 'win32' ? ['C:\\allowed'] : ['/allowed'];
        
        const result = await searchFilesWithValidation(
          testDir,
          '*test*',
          allowedDirs,
          {}
        );
        
        // Should only return the valid file, skipping the invalid one
        const expectedResult = process.platform === 'win32' ? 'C:\\allowed\\dir\\test.txt' : '/allowed/dir/test.txt';
        expect(result).toEqual([expectedResult]);
      });

      it('handles complex exclude patterns with wildcards', async () => {
        const mockEntries = [
          { name: 'test.txt', isDirectory: () => false },
          { name: 'test.backup', isDirectory: () => false },
          { name: 'important_test.js', isDirectory: () => false }
        ];
        
        mockFs.readdir.mockResolvedValueOnce(mockEntries as any);
        
        const testDir = process.platform === 'win32' ? 'C:\\allowed\\dir' : '/allowed/dir';
        const allowedDirs = process.platform === 'win32' ? ['C:\\allowed'] : ['/allowed'];
        
        const result = await searchFilesWithValidation(
          testDir,
          '*test*',
          allowedDirs,
          { excludePatterns: ['*.backup'] }
        );
        
        const expectedResults = process.platform === 'win32' ? [
          'C:\\allowed\\dir\\test.txt',
          'C:\\allowed\\dir\\important_test.js'
        ] : [
          '/allowed/dir/test.txt',
          '/allowed/dir/important_test.js'
        ];
        expect(result).toEqual(expectedResults);
      });
    });
  });

  describe('File Editing Functions', () => {
    describe('applyFileEdits', () => {
      beforeEach(() => {
        mockFs.readFile.mockResolvedValue('line1\nline2\nline3\n');
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.stat.mockResolvedValue({ mode: 0o100644 });
        mockFs.chmod.mockResolvedValue(undefined);
      });

      it('applies simple text replacement', async () => {
        const edits = [
          { oldText: 'line2', newText: 'modified line2' }
        ];
        
        mockFs.rename.mockResolvedValueOnce(undefined);
        
        const result = await applyFileEdits('/test/file.txt', edits, false);
        
        expect(result).toContain('modified line2');
        // Should write to temporary file then rename
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.txt\.[a-f0-9]+\.tmp$/),
          'line1\nmodified line2\nline3\n',
          'utf-8'
        );
        expect(mockFs.rename).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.txt\.[a-f0-9]+\.tmp$/),
          '/test/file.txt'
        );
      });

      it('treats dollar signs in replacement text literally', async () => {
        const edits = [
          { oldText: 'line2', newText: "price=$$; match=$&; before=$`; after=$'" }
        ];

        mockFs.rename.mockResolvedValueOnce(undefined);

        await applyFileEdits('/test/file.txt', edits, false);

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.txt\.[a-f0-9]+\.tmp$/),
          "line1\nprice=$$; match=$&; before=$`; after=$'\nline3\n",
          'utf-8'
        );
      });

      it('handles dry run mode', async () => {
        const edits = [
          { oldText: 'line2', newText: 'modified line2' }
        ];
        
        const result = await applyFileEdits('/test/file.txt', edits, true);
        
        expect(result).toContain('modified line2');
        expect(mockFs.writeFile).not.toHaveBeenCalled();
      });

      it('applies multiple edits sequentially', async () => {
        const edits = [
          { oldText: 'line1', newText: 'first line' },
          { oldText: 'line3', newText: 'third line' }
        ];
        
        mockFs.rename.mockResolvedValueOnce(undefined);
        
        await applyFileEdits('/test/file.txt', edits, false);
        
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.txt\.[a-f0-9]+\.tmp$/),
          'first line\nline2\nthird line\n',
          'utf-8'
        );
        expect(mockFs.rename).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.txt\.[a-f0-9]+\.tmp$/),
          '/test/file.txt'
        );
      });

      it('handles whitespace-flexible matching', async () => {
        mockFs.readFile.mockResolvedValue('  line1\n    line2\n  line3\n');
        
        const edits = [
          { oldText: 'line2', newText: 'modified line2' }
        ];
        
        mockFs.rename.mockResolvedValueOnce(undefined);
        
        await applyFileEdits('/test/file.txt', edits, false);
        
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.txt\.[a-f0-9]+\.tmp$/),
          '  line1\n    modified line2\n  line3\n',
          'utf-8'
        );
        expect(mockFs.rename).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.txt\.[a-f0-9]+\.tmp$/),
          '/test/file.txt'
        );
      });

      it('preserves file permissions after applying edits', async () => {
        mockFs.stat.mockResolvedValue({ mode: 0o100755 });
        const edits = [
          { oldText: 'line2', newText: 'modified line2' }
        ];
        
        mockFs.rename.mockResolvedValueOnce(undefined);
        
        await applyFileEdits('/test/script.sh', edits, false);
        
        expect(mockFs.stat).toHaveBeenCalledWith('/test/script.sh');
        expect(mockFs.chmod).toHaveBeenCalledWith('/test/script.sh', 0o755);
      });

      it('does not restore permissions in dry run mode', async () => {
        const edits = [
          { oldText: 'line2', newText: 'modified line2' }
        ];
        
        await applyFileEdits('/test/file.txt', edits, true);
        
        expect(mockFs.chmod).not.toHaveBeenCalled();
      });

      it('throws error for non-matching edits', async () => {
        const edits = [
          { oldText: 'nonexistent line', newText: 'replacement' }
        ];
        
        await expect(applyFileEdits('/test/file.txt', edits, false))
          .rejects.toThrow('Could not find exact match for edit');
      });

      it('handles complex multi-line edits with indentation', async () => {
        mockFs.readFile.mockResolvedValue('function test() {\n  console.log("hello");\n  return true;\n}');
        
        const edits = [
          { 
            oldText: '  console.log("hello");\n  return true;', 
            newText: '  console.log("world");\n  console.log("test");\n  return false;' 
          }
        ];
        
        mockFs.rename.mockResolvedValueOnce(undefined);
        
        await applyFileEdits('/test/file.js', edits, false);
        
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.js\.[a-f0-9]+\.tmp$/),
          'function test() {\n  console.log("world");\n  console.log("test");\n  return false;\n}',
          'utf-8'
        );
        expect(mockFs.rename).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.js\.[a-f0-9]+\.tmp$/),
          '/test/file.js'
        );
      });

      it('handles edits with different indentation patterns', async () => {
        mockFs.readFile.mockResolvedValue('    if (condition) {\n        doSomething();\n    }');
        
        const edits = [
          { 
            oldText: 'doSomething();', 
            newText: 'doSomethingElse();\n        doAnotherThing();' 
          }
        ];
        
        mockFs.rename.mockResolvedValueOnce(undefined);
        
        await applyFileEdits('/test/file.js', edits, false);
        
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.js\.[a-f0-9]+\.tmp$/),
          '    if (condition) {\n        doSomethingElse();\n        doAnotherThing();\n    }',
          'utf-8'
        );
        expect(mockFs.rename).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.js\.[a-f0-9]+\.tmp$/),
          '/test/file.js'
        );
      });

      it('handles CRLF line endings in file content', async () => {
        mockFs.readFile.mockResolvedValue('line1\r\nline2\r\nline3\r\n');
        
        const edits = [
          { oldText: 'line2', newText: 'modified line2' }
        ];
        
        mockFs.rename.mockResolvedValueOnce(undefined);
        
        await applyFileEdits('/test/file.txt', edits, false);
        
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.txt\.[a-f0-9]+\.tmp$/),
          'line1\nmodified line2\nline3\n',
          'utf-8'
        );
        expect(mockFs.rename).toHaveBeenCalledWith(
          expect.stringMatching(/\/test\/file\.txt\.[a-f0-9]+\.tmp$/),
          '/test/file.txt'
        );
      });
    });

    describe('tailFile', () => {
      it('handles empty files', async () => {
        mockFs.stat.mockResolvedValue({ size: 0 } as any);
        
        const result = await tailFile('/test/empty.txt', 5);
        
        expect(result).toBe('');
        expect(mockFs.open).not.toHaveBeenCalled();
      });

      it('calls stat to check file size', async () => {
        mockFs.stat.mockResolvedValue({ size: 100 } as any);
        
        // Mock file handle with proper typing
        const mockFileHandle = {
          read: vi.fn(),
          close: vi.fn()
        } as any;
        
        mockFileHandle.read.mockResolvedValue({ bytesRead: 0 });
        mockFileHandle.close.mockResolvedValue(undefined);
        
        mockFs.open.mockResolvedValue(mockFileHandle);
        
        await tailFile('/test/file.txt', 2);
        
        expect(mockFs.stat).toHaveBeenCalledWith('/test/file.txt');
        expect(mockFs.open).toHaveBeenCalledWith('/test/file.txt', 'r');
      });

      it('handles files with content and returns last lines', async () => {
        mockFs.stat.mockResolvedValue({ size: 50 } as any);
        
        const mockFileHandle = {
          read: vi.fn(),
          close: vi.fn()
        } as any;
        
        // Simulate reading file content in chunks
        mockFileHandle.read
          .mockResolvedValueOnce({ bytesRead: 20, buffer: Buffer.from('line3\nline4\nline5\n') })
          .mockResolvedValueOnce({ bytesRead: 0 });
        mockFileHandle.close.mockResolvedValue(undefined);
        
        mockFs.open.mockResolvedValue(mockFileHandle);
        
        const result = await tailFile('/test/file.txt', 2);
        
        expect(mockFileHandle.close).toHaveBeenCalled();
      });

      it('preserves UTF-8 characters split across chunk boundaries', async () => {
        const content = Buffer.concat([
          Buffer.from('discard\n'),
          Buffer.from('界'),
          Buffer.alloc(1017, 'a'),
          Buffer.from('\nlast'),
        ]);
        const mockFileHandle = createMockFileHandle(content);

        mockFs.stat.mockResolvedValue({ size: content.length } as any);
        mockFs.open.mockResolvedValue(mockFileHandle);

        const result = await tailFile('/test/file.txt', 2);

        expect(result).toBe(`界${'a'.repeat(1017)}\nlast`);
      });

      it('handles read errors gracefully', async () => {
        mockFs.stat.mockResolvedValue({ size: 100 } as any);
        
        const mockFileHandle = {
          read: vi.fn(),
          close: vi.fn()
        } as any;
        
        mockFileHandle.read.mockResolvedValue({ bytesRead: 0 });
        mockFileHandle.close.mockResolvedValue(undefined);
        
        mockFs.open.mockResolvedValue(mockFileHandle);
        
        await tailFile('/test/file.txt', 5);
        
        expect(mockFileHandle.close).toHaveBeenCalled();
      });
    });

    describe('headFile', () => {
      it('opens file for reading', async () => {
        // Mock file handle with proper typing
        const mockFileHandle = {
          read: vi.fn(),
          close: vi.fn()
        } as any;
        
        mockFileHandle.read.mockResolvedValue({ bytesRead: 0 });
        mockFileHandle.close.mockResolvedValue(undefined);
        
        mockFs.open.mockResolvedValue(mockFileHandle);
        
        await headFile('/test/file.txt', 2);
        
        expect(mockFs.open).toHaveBeenCalledWith('/test/file.txt', 'r');
      });

      it('handles files with content and returns first lines', async () => {
        const mockFileHandle = {
          read: vi.fn(),
          close: vi.fn()
        } as any;
        
        // Simulate reading file content with newlines
        mockFileHandle.read
          .mockResolvedValueOnce({ bytesRead: 20, buffer: Buffer.from('line1\nline2\nline3\n') })
          .mockResolvedValueOnce({ bytesRead: 0 });
        mockFileHandle.close.mockResolvedValue(undefined);
        
        mockFs.open.mockResolvedValue(mockFileHandle);
        
        const result = await headFile('/test/file.txt', 2);
        
        expect(mockFileHandle.close).toHaveBeenCalled();
      });

      it('preserves UTF-8 characters split across chunk boundaries', async () => {
        const content = Buffer.concat([
          Buffer.alloc(1023, 'a'),
          Buffer.from('界\nsecond'),
        ]);
        const mockFileHandle = createMockFileHandle(content);

        mockFs.open.mockResolvedValue(mockFileHandle);

        const result = await headFile('/test/file.txt', 1);

        expect(result).toBe(`${'a'.repeat(1023)}界`);
      });

      it('handles files with leftover content', async () => {
        const mockFileHandle = {
          read: vi.fn(),
          close: vi.fn()
        } as any;
        
        // Simulate reading file content without final newline
        mockFileHandle.read
          .mockResolvedValueOnce({ bytesRead: 15, buffer: Buffer.from('line1\nline2\nend') })
          .mockResolvedValueOnce({ bytesRead: 0 });
        mockFileHandle.close.mockResolvedValue(undefined);
        
        mockFs.open.mockResolvedValue(mockFileHandle);
        
        const result = await headFile('/test/file.txt', 5);
        
        expect(mockFileHandle.close).toHaveBeenCalled();
      });

      it('handles reaching requested line count', async () => {
        const mockFileHandle = {
          read: vi.fn(),
          close: vi.fn()
        } as any;
        
        // Simulate reading exactly the requested number of lines
        mockFileHandle.read
          .mockResolvedValueOnce({ bytesRead: 12, buffer: Buffer.from('line1\nline2\n') })
          .mockResolvedValueOnce({ bytesRead: 0 });
        mockFileHandle.close.mockResolvedValue(undefined);
        
        mockFs.open.mockResolvedValue(mockFileHandle);
        
        const result = await headFile('/test/file.txt', 2);
        
        expect(mockFileHandle.close).toHaveBeenCalled();
      });
    });
  });
});
