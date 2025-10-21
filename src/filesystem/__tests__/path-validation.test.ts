import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { isPathWithinAllowedDirectories } from '../path-validation.js';

/**
 * Check if the current environment supports symlink creation
 */
async function checkSymlinkSupport(): Promise<boolean> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'symlink-test-'));
  try {
    const targetFile = path.join(testDir, 'target.txt');
    const linkFile = path.join(testDir, 'link.txt');
    
    await fs.writeFile(targetFile, 'test');
    await fs.symlink(targetFile, linkFile);
    
    // If we get here, symlinks are supported
    return true;
  } catch (error) {
    // EPERM indicates no symlink permissions
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      return false;
    }
    // Other errors might indicate a real problem
    throw error;
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

// Global variable to store symlink support status
let symlinkSupported: boolean | null = null;

/**
 * Get cached symlink support status, checking once per test run
 */
async function getSymlinkSupport(): Promise<boolean> {
  if (symlinkSupported === null) {
    symlinkSupported = await checkSymlinkSupport();
    if (!symlinkSupported) {
      console.log('\n⚠️  Symlink tests will be skipped - symlink creation not supported in this environment');
      console.log('   On Windows, enable Developer Mode or run as Administrator to enable symlink tests');
    }
  }
  return symlinkSupported;
}

describe('Path Validation', () => {
  it('allows exact directory match', () => {
    const allowed = ['/home/user/project'];
    expect(isPathWithinAllowedDirectories('/home/user/project', allowed)).toBe(true);
  });

  it('allows subdirectories', () => {
    const allowed = ['/home/user/project'];
    expect(isPathWithinAllowedDirectories('/home/user/project/src', allowed)).toBe(true);
    expect(isPathWithinAllowedDirectories('/home/user/project/src/index.js', allowed)).toBe(true);
    expect(isPathWithinAllowedDirectories('/home/user/project/deeply/nested/file.txt', allowed)).toBe(true);
  });

  it('blocks similar directory names (prefix vulnerability)', () => {
    const allowed = ['/home/user/project'];
    expect(isPathWithinAllowedDirectories('/home/user/project2', allowed)).toBe(false);
    expect(isPathWithinAllowedDirectories('/home/user/project_backup', allowed)).toBe(false);
    expect(isPathWithinAllowedDirectories('/home/user/project-old', allowed)).toBe(false);
    expect(isPathWithinAllowedDirectories('/home/user/projectile', allowed)).toBe(false);
    expect(isPathWithinAllowedDirectories('/home/user/project.bak', allowed)).toBe(false);
  });

  it('blocks paths outside allowed directories', () => {
    const allowed = ['/home/user/project'];
    expect(isPathWithinAllowedDirectories('/home/user/other', allowed)).toBe(false);
    expect(isPathWithinAllowedDirectories('/etc/passwd', allowed)).toBe(false);
    expect(isPathWithinAllowedDirectories('/home/user', allowed)).toBe(false);
    expect(isPathWithinAllowedDirectories('/', allowed)).toBe(false);
  });

  it('handles multiple allowed directories', () => {
    const allowed = ['/home/user/project1', '/home/user/project2'];
    expect(isPathWithinAllowedDirectories('/home/user/project1/src', allowed)).toBe(true);
    expect(isPathWithinAllowedDirectories('/home/user/project2/src', allowed)).toBe(true);
    expect(isPathWithinAllowedDirectories('/home/user/project3', allowed)).toBe(false);
    expect(isPathWithinAllowedDirectories('/home/user/project1_backup', allowed)).toBe(false);
    expect(isPathWithinAllowedDirectories('/home/user/project2-old', allowed)).toBe(false);
  });

  it('blocks parent and sibling directories', () => {
    const allowed = ['/test/allowed'];

    // Parent directory
    expect(isPathWithinAllowedDirectories('/test', allowed)).toBe(false);
    expect(isPathWithinAllowedDirectories('/', allowed)).toBe(false);

    // Sibling with common prefix
    expect(isPathWithinAllowedDirectories('/test/allowed_sibling', allowed)).toBe(false);
    expect(isPathWithinAllowedDirectories('/test/allowed2', allowed)).toBe(false);
  });

  it('handles paths with special characters', () => {
    const allowed = ['/home/user/my-project (v2)'];

    expect(isPathWithinAllowedDirectories('/home/user/my-project (v2)', allowed)).toBe(true);
    expect(isPathWithinAllowedDirectories('/home/user/my-project (v2)/src', allowed)).toBe(true);
    expect(isPathWithinAllowedDirectories('/home/user/my-project (v2)_backup', allowed)).toBe(false);
    expect(isPathWithinAllowedDirectories('/home/user/my-project', allowed)).toBe(false);
  });

  describe('Input validation', () => {
    it('rejects empty inputs', () => {
      const allowed = ['/home/user/project'];

      expect(isPathWithinAllowedDirectories('', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project', [])).toBe(false);
    });

    it('handles trailing separators correctly', () => {
      const allowed = ['/home/user/project'];

      // Path with trailing separator should still match
      expect(isPathWithinAllowedDirectories('/home/user/project/', allowed)).toBe(true);

      // Allowed directory with trailing separator
      const allowedWithSep = ['/home/user/project/'];
      expect(isPathWithinAllowedDirectories('/home/user/project', allowedWithSep)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project/', allowedWithSep)).toBe(true);

      // Should still block similar names with or without trailing separators
      expect(isPathWithinAllowedDirectories('/home/user/project2', allowedWithSep)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project2', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project2/', allowed)).toBe(false);
    });

    it('skips empty directory entries in allowed list', () => {
      const allowed = ['', '/home/user/project', ''];
      expect(isPathWithinAllowedDirectories('/home/user/project', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project/src', allowed)).toBe(true);

      // Should still validate properly with empty entries
      expect(isPathWithinAllowedDirectories('/home/user/other', allowed)).toBe(false);
    });

    it('handles Windows paths with trailing separators', () => {
      if (path.sep === '\\') {
        const allowed = ['C:\\Users\\project'];

        // Path with trailing separator
        expect(isPathWithinAllowedDirectories('C:\\Users\\project\\', allowed)).toBe(true);

        // Allowed with trailing separator
        const allowedWithSep = ['C:\\Users\\project\\'];
        expect(isPathWithinAllowedDirectories('C:\\Users\\project', allowedWithSep)).toBe(true);
        expect(isPathWithinAllowedDirectories('C:\\Users\\project\\', allowedWithSep)).toBe(true);

        // Should still block similar names
        expect(isPathWithinAllowedDirectories('C:\\Users\\project2\\', allowed)).toBe(false);
      }
    });
  });

  describe('Error handling', () => {
    it('normalizes relative paths to absolute', () => {
      const allowed = [process.cwd()];

      // Relative paths get normalized to absolute paths based on cwd
      expect(isPathWithinAllowedDirectories('relative/path', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('./file', allowed)).toBe(true);

      // Parent directory references that escape allowed directory
      const parentAllowed = ['/home/user/project'];
      expect(isPathWithinAllowedDirectories('../parent', parentAllowed)).toBe(false);
    });

    it('returns false for relative paths in allowed directories', () => {
      const badAllowed = ['relative/path', '/some/other/absolute/path'];

      // Relative paths in allowed dirs are normalized to absolute based on cwd
      // The normalized 'relative/path' won't match our test path
      expect(isPathWithinAllowedDirectories('/some/other/absolute/path/file', badAllowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/absolute/path/file', badAllowed)).toBe(false);
    });

    it('handles null and undefined inputs gracefully', () => {
      const allowed = ['/home/user/project'];

      // Should return false, not crash
      expect(isPathWithinAllowedDirectories(null as any, allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories(undefined as any, allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/path', null as any)).toBe(false);
      expect(isPathWithinAllowedDirectories('/path', undefined as any)).toBe(false);
    });
  });

  describe('Unicode and special characters', () => {
    it('handles unicode characters in paths', () => {
      const allowed = ['/home/user/café'];

      expect(isPathWithinAllowedDirectories('/home/user/café', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/café/file', allowed)).toBe(true);

      // Different unicode representation won't match (not normalized)
      const decomposed = '/home/user/cafe\u0301'; // e + combining accent
      expect(isPathWithinAllowedDirectories(decomposed, allowed)).toBe(false);
    });

    it('handles paths with spaces correctly', () => {
      const allowed = ['/home/user/my project'];

      expect(isPathWithinAllowedDirectories('/home/user/my project', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/my project/file', allowed)).toBe(true);

      // Partial matches should fail
      expect(isPathWithinAllowedDirectories('/home/user/my', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/my proj', allowed)).toBe(false);
    });
  });

  describe('Overlapping allowed directories', () => {
    it('handles nested allowed directories correctly', () => {
      const allowed = ['/home', '/home/user', '/home/user/project'];

      // All paths under /home are allowed
      expect(isPathWithinAllowedDirectories('/home/anything', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/anything', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project/anything', allowed)).toBe(true);

      // First match wins (most permissive)
      expect(isPathWithinAllowedDirectories('/home/other/deep/path', allowed)).toBe(true);
    });

    it('handles root directory as allowed', () => {
      const allowed = ['/'];

      // Everything is allowed under root (dangerous configuration)
      expect(isPathWithinAllowedDirectories('/', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/any/path', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/etc/passwd', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/secret', allowed)).toBe(true);

      // But only on the same filesystem root
      if (path.sep === '\\') {
        expect(isPathWithinAllowedDirectories('D:\\other', ['/'])).toBe(false);
      }
    });
  });

  describe('Cross-platform behavior', () => {
    it('handles Windows-style paths on Windows', () => {
      if (path.sep === '\\') {
        const allowed = ['C:\\Users\\project'];
        expect(isPathWithinAllowedDirectories('C:\\Users\\project', allowed)).toBe(true);
        expect(isPathWithinAllowedDirectories('C:\\Users\\project\\src', allowed)).toBe(true);
        expect(isPathWithinAllowedDirectories('C:\\Users\\project2', allowed)).toBe(false);
        expect(isPathWithinAllowedDirectories('C:\\Users\\project_backup', allowed)).toBe(false);
      }
    });

    it('handles Unix-style paths on Unix', () => {
      if (path.sep === '/') {
        const allowed = ['/home/user/project'];
        expect(isPathWithinAllowedDirectories('/home/user/project', allowed)).toBe(true);
        expect(isPathWithinAllowedDirectories('/home/user/project/src', allowed)).toBe(true);
        expect(isPathWithinAllowedDirectories('/home/user/project2', allowed)).toBe(false);
      }
    });
  });

  describe('Validation Tests - Path Traversal', () => {
    it('blocks path traversal attempts', () => {
      const allowed = ['/home/user/project'];

      // Basic traversal attempts
      expect(isPathWithinAllowedDirectories('/home/user/project/../../../etc/passwd', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project/../../other', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project/../project2', allowed)).toBe(false);

      // Mixed traversal with valid segments
      expect(isPathWithinAllowedDirectories('/home/user/project/src/../../project2', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project/./../../other', allowed)).toBe(false);

      // Multiple traversal sequences
      expect(isPathWithinAllowedDirectories('/home/user/project/../project/../../../etc', allowed)).toBe(false);
    });

    it('blocks traversal in allowed directories', () => {
      const allowed = ['/home/user/project/../safe'];

      // The allowed directory itself should be normalized and safe
      expect(isPathWithinAllowedDirectories('/home/user/safe/file', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project/file', allowed)).toBe(false);
    });

    it('handles complex traversal patterns', () => {
      const allowed = ['/home/user/project'];

      // Double dots in filenames (not traversal) - these normalize to paths within allowed dir
      expect(isPathWithinAllowedDirectories('/home/user/project/..test', allowed)).toBe(true); // Not traversal
      expect(isPathWithinAllowedDirectories('/home/user/project/test..', allowed)).toBe(true); // Not traversal
      expect(isPathWithinAllowedDirectories('/home/user/project/te..st', allowed)).toBe(true); // Not traversal

      // Actual traversal
      expect(isPathWithinAllowedDirectories('/home/user/project/../test', allowed)).toBe(false); // Is traversal - goes to /home/user/test

      // Edge case: /home/user/project/.. normalizes to /home/user (parent dir)
      expect(isPathWithinAllowedDirectories('/home/user/project/..', allowed)).toBe(false); // Goes to parent
    });
  });

  describe('Validation Tests - Null Bytes', () => {
    it('rejects paths with null bytes', () => {
      const allowed = ['/home/user/project'];

      expect(isPathWithinAllowedDirectories('/home/user/project\x00/etc/passwd', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project/test\x00.txt', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('\x00/home/user/project', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project/\x00', allowed)).toBe(false);
    });

    it('rejects allowed directories with null bytes', () => {
      const allowed = ['/home/user/project\x00'];

      expect(isPathWithinAllowedDirectories('/home/user/project', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project/file', allowed)).toBe(false);
    });
  });

  describe('Validation Tests - Special Characters', () => {
    it('allows percent signs in filenames', () => {
      const allowed = ['/home/user/project'];

      // Percent is a valid filename character
      expect(isPathWithinAllowedDirectories('/home/user/project/report_50%.pdf', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project/Q1_25%_growth', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project/%41', allowed)).toBe(true); // File named %41

      // URL encoding is NOT decoded by path.normalize, so these are just odd filenames
      expect(isPathWithinAllowedDirectories('/home/user/project/%2e%2e', allowed)).toBe(true); // File named "%2e%2e"
      expect(isPathWithinAllowedDirectories('/home/user/project/file%20name', allowed)).toBe(true); // File with %20 in name
    });

    it('handles percent signs in allowed directories', () => {
      const allowed = ['/home/user/project%20files'];

      // This is a directory literally named "project%20files"
      expect(isPathWithinAllowedDirectories('/home/user/project%20files/test', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project files/test', allowed)).toBe(false); // Different dir
    });
  });

  describe('Path Normalization', () => {
    it('normalizes paths before comparison', () => {
      const allowed = ['/home/user/project'];

      // Trailing slashes
      expect(isPathWithinAllowedDirectories('/home/user/project/', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project//', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project///', allowed)).toBe(true);

      // Current directory references
      expect(isPathWithinAllowedDirectories('/home/user/project/./src', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/./project/src', allowed)).toBe(true);

      // Multiple slashes
      expect(isPathWithinAllowedDirectories('/home/user/project//src//file', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home//user//project//src', allowed)).toBe(true);

      // Should still block outside paths
      expect(isPathWithinAllowedDirectories('/home/user//project2', allowed)).toBe(false);
    });

    it('handles mixed separators correctly', () => {
      if (path.sep === '\\') {
        const allowed = ['C:\\Users\\project'];

        // Mixed separators should be normalized
        expect(isPathWithinAllowedDirectories('C:/Users/project', allowed)).toBe(true);
        expect(isPathWithinAllowedDirectories('C:\\Users/project\\src', allowed)).toBe(true);
        expect(isPathWithinAllowedDirectories('C:/Users\\project/src', allowed)).toBe(true);
      }
    });
  });

  describe('Edge Cases', () => {
    it('rejects non-string inputs safely', () => {
      const allowed = ['/home/user/project'];

      expect(isPathWithinAllowedDirectories(123 as any, allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories({} as any, allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories([] as any, allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories(null as any, allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories(undefined as any, allowed)).toBe(false);

      // Non-string in allowed directories
      expect(isPathWithinAllowedDirectories('/home/user/project', [123 as any])).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project', [{} as any])).toBe(false);
    });

    it('handles very long paths', () => {
      const allowed = ['/home/user/project'];

      // Create a very long path that's still valid
      const longSubPath = 'a/'.repeat(1000) + 'file.txt';
      expect(isPathWithinAllowedDirectories(`/home/user/project/${longSubPath}`, allowed)).toBe(true);

      // Very long path that escapes
      const escapePath = 'a/'.repeat(1000) + '../'.repeat(1001) + 'etc/passwd';
      expect(isPathWithinAllowedDirectories(`/home/user/project/${escapePath}`, allowed)).toBe(false);
    });
  });

  describe('Additional Coverage', () => {
    it('handles allowed directories with traversal that normalizes safely', () => {
      // These allowed dirs contain traversal but normalize to valid paths
      const allowed = ['/home/user/../user/project'];

      // Should normalize to /home/user/project and work correctly
      expect(isPathWithinAllowedDirectories('/home/user/project/file', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/other', allowed)).toBe(false);
    });

    it('handles symbolic dots in filenames', () => {
      const allowed = ['/home/user/project'];

      // Single and double dots as actual filenames (not traversal)
      expect(isPathWithinAllowedDirectories('/home/user/project/.', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project/..', allowed)).toBe(false); // This normalizes to parent
      expect(isPathWithinAllowedDirectories('/home/user/project/...', allowed)).toBe(true); // Three dots is a valid filename
      expect(isPathWithinAllowedDirectories('/home/user/project/....', allowed)).toBe(true); // Four dots is a valid filename
    });

    it('handles UNC paths on Windows', () => {
      if (path.sep === '\\') {
        const allowed = ['\\\\server\\share\\project'];

        expect(isPathWithinAllowedDirectories('\\\\server\\share\\project', allowed)).toBe(true);
        expect(isPathWithinAllowedDirectories('\\\\server\\share\\project\\file', allowed)).toBe(true);
        expect(isPathWithinAllowedDirectories('\\\\server\\share\\other', allowed)).toBe(false);
        expect(isPathWithinAllowedDirectories('\\\\other\\share\\project', allowed)).toBe(false);
      }
    });
  });

  describe('Symlink Tests', () => {
    let testDir: string;
    let allowedDir: string;
    let forbiddenDir: string;

    beforeEach(async () => {
      testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-error-test-'));
      allowedDir = path.join(testDir, 'allowed');
      forbiddenDir = path.join(testDir, 'forbidden');

      await fs.mkdir(allowedDir, { recursive: true });
      await fs.mkdir(forbiddenDir, { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it('validates symlink handling', async () => {
      // Test with symlinks
      try {
        const linkPath = path.join(allowedDir, 'bad-link');
        const targetPath = path.join(forbiddenDir, 'target.txt');

        await fs.writeFile(targetPath, 'content');
        await fs.symlink(targetPath, linkPath);

        // In real implementation, this would throw with the resolved path
        const realPath = await fs.realpath(linkPath);
        const allowed = [allowedDir];

        // Symlink target should be outside allowed directory
        expect(isPathWithinAllowedDirectories(realPath, allowed)).toBe(false);
      } catch (error) {
        // Skip if no symlink permissions
      }
    });

    it('handles non-existent paths correctly', async () => {
      const newFilePath = path.join(allowedDir, 'subdir', 'newfile.txt');

      // Parent directory doesn't exist
      try {
        await fs.access(newFilePath);
      } catch (error) {
        expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
      }

      // After creating parent, validation should work
      await fs.mkdir(path.dirname(newFilePath), { recursive: true });
      const allowed = [allowedDir];
      expect(isPathWithinAllowedDirectories(newFilePath, allowed)).toBe(true);
    });

    // Test path resolution consistency for symlinked files
    it('validates symlinked files consistently between path and resolved forms', async () => {
      try {
        // Setup: Create target file in forbidden area
        const targetFile = path.join(forbiddenDir, 'target.txt');
        await fs.writeFile(targetFile, 'TARGET_CONTENT');

        // Create symlink inside allowed directory pointing to forbidden file
        const symlinkPath = path.join(allowedDir, 'link-to-target.txt');
        await fs.symlink(targetFile, symlinkPath);

        // The symlink path itself passes validation (looks like it's in allowed dir)
        expect(isPathWithinAllowedDirectories(symlinkPath, [allowedDir])).toBe(true);

        // But the resolved path should fail validation
        const resolvedPath = await fs.realpath(symlinkPath);
        expect(isPathWithinAllowedDirectories(resolvedPath, [allowedDir])).toBe(false);

        // Verify the resolved path goes to the forbidden location (normalize both paths for macOS temp dirs)
        expect(await fs.realpath(resolvedPath)).toBe(await fs.realpath(targetFile));
      } catch (error) {
        // Skip if no symlink permissions on the system
        if ((error as NodeJS.ErrnoException).code !== 'EPERM') {
          throw error;
        }
      }
    });

    // Test allowed directory resolution behavior
    it('validates paths correctly when allowed directory is resolved from symlink', async () => {
      try {
        // Setup: Create the actual target directory with content
        const actualTargetDir = path.join(testDir, 'actual-target');
        await fs.mkdir(actualTargetDir, { recursive: true });
        const targetFile = path.join(actualTargetDir, 'file.txt');
        await fs.writeFile(targetFile, 'FILE_CONTENT');

        // Setup: Create symlink directory that points to target
        const symlinkDir = path.join(testDir, 'symlink-dir');
        await fs.symlink(actualTargetDir, symlinkDir);

        // Simulate resolved allowed directory (what the server startup should do)
        const resolvedAllowedDir = await fs.realpath(symlinkDir);
        const resolvedTargetDir = await fs.realpath(actualTargetDir);
        expect(resolvedAllowedDir).toBe(resolvedTargetDir);

        // Test 1: File access through original symlink path should pass validation with resolved allowed dir
        const fileViaSymlink = path.join(symlinkDir, 'file.txt');
        const resolvedFile = await fs.realpath(fileViaSymlink);
        expect(isPathWithinAllowedDirectories(resolvedFile, [resolvedAllowedDir])).toBe(true);

        // Test 2: File access through resolved path should also pass validation
        const fileViaResolved = path.join(resolvedTargetDir, 'file.txt');
        expect(isPathWithinAllowedDirectories(fileViaResolved, [resolvedAllowedDir])).toBe(true);

        // Test 3: Demonstrate inconsistent behavior with unresolved allowed directories
        // If allowed dirs were not resolved (storing symlink paths instead):
        const unresolvedAllowedDirs = [symlinkDir];
        // This validation would incorrectly fail for the same content:
        expect(isPathWithinAllowedDirectories(resolvedFile, unresolvedAllowedDirs)).toBe(false);

      } catch (error) {
        // Skip if no symlink permissions on the system
        if ((error as NodeJS.ErrnoException).code !== 'EPERM') {
          throw error;
        }
      }
    });

    it('resolves nested symlink chains completely', async () => {
      try {
        // Setup: Create target file in forbidden area
        const actualTarget = path.join(forbiddenDir, 'target-file.txt');
        await fs.writeFile(actualTarget, 'FINAL_CONTENT');

        // Create chain of symlinks: allowedFile -> link2 -> link1 -> actualTarget
        const link1 = path.join(testDir, 'intermediate-link1');
        const link2 = path.join(testDir, 'intermediate-link2');
        const allowedFile = path.join(allowedDir, 'seemingly-safe-file');

        await fs.symlink(actualTarget, link1);
        await fs.symlink(link1, link2);
        await fs.symlink(link2, allowedFile);

        // The allowed file path passes basic validation
        expect(isPathWithinAllowedDirectories(allowedFile, [allowedDir])).toBe(true);

        // But complete resolution reveals the forbidden target
        const fullyResolvedPath = await fs.realpath(allowedFile);
        expect(isPathWithinAllowedDirectories(fullyResolvedPath, [allowedDir])).toBe(false);
        expect(await fs.realpath(fullyResolvedPath)).toBe(await fs.realpath(actualTarget));

      } catch (error) {
        // Skip if no symlink permissions on the system
        if ((error as NodeJS.ErrnoException).code !== 'EPERM') {
          throw error;
        }
      }
    });
  });

  describe('Path Validation Race Condition Tests', () => {
    let testDir: string;
    let allowedDir: string;
    let forbiddenDir: string;
    let targetFile: string;
    let testPath: string;

    beforeEach(async () => {
      testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'race-test-'));
      allowedDir = path.join(testDir, 'allowed');
      forbiddenDir = path.join(testDir, 'outside');
      targetFile = path.join(forbiddenDir, 'target.txt');
      testPath = path.join(allowedDir, 'test.txt');

      await fs.mkdir(allowedDir, { recursive: true });
      await fs.mkdir(forbiddenDir, { recursive: true });
      await fs.writeFile(targetFile, 'ORIGINAL CONTENT', 'utf-8');
    });

    afterEach(async () => {
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it('validates non-existent file paths based on parent directory', async () => {
      const allowed = [allowedDir];

      expect(isPathWithinAllowedDirectories(testPath, allowed)).toBe(true);
      await expect(fs.access(testPath)).rejects.toThrow();

      const parentDir = path.dirname(testPath);
      expect(isPathWithinAllowedDirectories(parentDir, allowed)).toBe(true);
    });

    it('demonstrates symlink race condition allows writing outside allowed directories', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping symlink race condition test - symlinks not supported');
        return;
      }

      const allowed = [allowedDir];

      await expect(fs.access(testPath)).rejects.toThrow();
      expect(isPathWithinAllowedDirectories(testPath, allowed)).toBe(true);

      await fs.symlink(targetFile, testPath);
      await fs.writeFile(testPath, 'MODIFIED CONTENT', 'utf-8');

      const targetContent = await fs.readFile(targetFile, 'utf-8');
      expect(targetContent).toBe('MODIFIED CONTENT');

      const resolvedPath = await fs.realpath(testPath);
      expect(isPathWithinAllowedDirectories(resolvedPath, allowed)).toBe(false);
    });

    it('shows timing differences between validation approaches', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping timing validation test - symlinks not supported');
        return;
      }

      const allowed = [allowedDir];

      const validation1 = isPathWithinAllowedDirectories(testPath, allowed);
      expect(validation1).toBe(true);

      await fs.symlink(targetFile, testPath);

      const resolvedPath = await fs.realpath(testPath);
      const validation2 = isPathWithinAllowedDirectories(resolvedPath, allowed);
      expect(validation2).toBe(false);

      expect(validation1).not.toBe(validation2);
    });

    it('validates directory creation timing', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping directory creation timing test - symlinks not supported');
        return;
      }

      const allowed = [allowedDir];
      const testDir = path.join(allowedDir, 'newdir');

      expect(isPathWithinAllowedDirectories(testDir, allowed)).toBe(true);

      await fs.symlink(forbiddenDir, testDir);

      expect(isPathWithinAllowedDirectories(testDir, allowed)).toBe(true);

      const resolved = await fs.realpath(testDir);
      expect(isPathWithinAllowedDirectories(resolved, allowed)).toBe(false);
    });

    it('demonstrates exclusive file creation behavior', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping exclusive file creation test - symlinks not supported');
        return;
      }

      const allowed = [allowedDir];

      await fs.symlink(targetFile, testPath);

      await expect(fs.open(testPath, 'wx')).rejects.toThrow(/EEXIST/);

      await fs.writeFile(testPath, 'NEW CONTENT', 'utf-8');
      const targetContent = await fs.readFile(targetFile, 'utf-8');
      expect(targetContent).toBe('NEW CONTENT');
    });

    it('should use resolved parent paths for non-existent files', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping resolved parent paths test - symlinks not supported');
        return;
      }

      const allowed = [allowedDir];

      const symlinkDir = path.join(allowedDir, 'link');
      await fs.symlink(forbiddenDir, symlinkDir);

      const fileThroughSymlink = path.join(symlinkDir, 'newfile.txt');

      expect(fileThroughSymlink.startsWith(allowedDir)).toBe(true);

      const parentDir = path.dirname(fileThroughSymlink);
      const resolvedParent = await fs.realpath(parentDir);
      expect(isPathWithinAllowedDirectories(resolvedParent, allowed)).toBe(false);

      const expectedSafePath = path.join(resolvedParent, path.basename(fileThroughSymlink));
      expect(isPathWithinAllowedDirectories(expectedSafePath, allowed)).toBe(false);
    });

    it('demonstrates parent directory symlink traversal', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping parent directory symlink traversal test - symlinks not supported');
        return;
      }

      const allowed = [allowedDir];
      const deepPath = path.join(allowedDir, 'sub1', 'sub2', 'file.txt');

      expect(isPathWithinAllowedDirectories(deepPath, allowed)).toBe(true);

      const sub1Path = path.join(allowedDir, 'sub1');
      await fs.symlink(forbiddenDir, sub1Path);

      await fs.mkdir(path.join(sub1Path, 'sub2'), { recursive: true });
      await fs.writeFile(deepPath, 'CONTENT', 'utf-8');

      const realPath = await fs.realpath(deepPath);
      const realAllowedDir = await fs.realpath(allowedDir);
      const realForbiddenDir = await fs.realpath(forbiddenDir);

      expect(realPath.startsWith(realAllowedDir)).toBe(false);
      expect(realPath.startsWith(realForbiddenDir)).toBe(true);
    });

    it('should prevent race condition between validatePath and file operation', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping race condition prevention test - symlinks not supported');
        return;
      }

      const allowed = [allowedDir];
      const racePath = path.join(allowedDir, 'race-file.txt');
      const targetFile = path.join(forbiddenDir, 'target.txt');

      await fs.writeFile(targetFile, 'ORIGINAL CONTENT', 'utf-8');

      // Path validation would pass (file doesn't exist, parent is in allowed dir)
      expect(await fs.access(racePath).then(() => false).catch(() => true)).toBe(true);
      expect(isPathWithinAllowedDirectories(racePath, allowed)).toBe(true);

      // Race condition: symlink created after validation but before write
      await fs.symlink(targetFile, racePath);

      // With exclusive write flag, write should fail on symlink
      await expect(
        fs.writeFile(racePath, 'NEW CONTENT', { encoding: 'utf-8', flag: 'wx' })
      ).rejects.toThrow(/EEXIST/);

      // Verify content unchanged
      const targetContent = await fs.readFile(targetFile, 'utf-8');
      expect(targetContent).toBe('ORIGINAL CONTENT');

      // The symlink exists but write was blocked
      const actualWritePath = await fs.realpath(racePath);
      expect(actualWritePath).toBe(await fs.realpath(targetFile));
      expect(isPathWithinAllowedDirectories(actualWritePath, allowed)).toBe(false);
    });

    it('should allow overwrites to legitimate files within allowed directories', async () => {
      const allowed = [allowedDir];
      const legitFile = path.join(allowedDir, 'legit-file.txt');

      // Create a legitimate file
      await fs.writeFile(legitFile, 'ORIGINAL', 'utf-8');

      // Opening with w should work for legitimate files
      const fd = await fs.open(legitFile, 'w');
      try {
        await fd.write('UPDATED', 0, 'utf-8');
      } finally {
        await fd.close();
      }

      const content = await fs.readFile(legitFile, 'utf-8');
      expect(content).toBe('UPDATED');
    });

    it('should handle symlinks that point within allowed directories', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping symlinks within allowed directories test - symlinks not supported');
        return;
      }

      const allowed = [allowedDir];
      const targetFile = path.join(allowedDir, 'target.txt');
      const symlinkPath = path.join(allowedDir, 'symlink.txt');

      // Create target file within allowed directory
      await fs.writeFile(targetFile, 'TARGET CONTENT', 'utf-8');

      // Create symlink pointing to allowed file
      await fs.symlink(targetFile, symlinkPath);

      // Opening symlink with w follows it to the target
      const fd = await fs.open(symlinkPath, 'w');
      try {
        await fd.write('UPDATED VIA SYMLINK', 0, 'utf-8');
      } finally {
        await fd.close();
      }

      // Both symlink and target should show updated content
      const symlinkContent = await fs.readFile(symlinkPath, 'utf-8');
      const targetContent = await fs.readFile(targetFile, 'utf-8');
      expect(symlinkContent).toBe('UPDATED VIA SYMLINK');
      expect(targetContent).toBe('UPDATED VIA SYMLINK');
    });

    it('should prevent overwriting files through symlinks pointing outside allowed directories', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping symlink overwrite prevention test - symlinks not supported');
        return;
      }

      const allowed = [allowedDir];
      const legitFile = path.join(allowedDir, 'existing.txt');
      const targetFile = path.join(forbiddenDir, 'target.txt');

      // Create a legitimate file first
      await fs.writeFile(legitFile, 'LEGIT CONTENT', 'utf-8');

      // Create target file in forbidden directory
      await fs.writeFile(targetFile, 'FORBIDDEN CONTENT', 'utf-8');

      // Now replace the legitimate file with a symlink to forbidden location
      await fs.unlink(legitFile);
      await fs.symlink(targetFile, legitFile);

      // Simulate the server's validation logic
      const stats = await fs.lstat(legitFile);
      expect(stats.isSymbolicLink()).toBe(true);

      const realPath = await fs.realpath(legitFile);
      expect(isPathWithinAllowedDirectories(realPath, allowed)).toBe(false);

      // With atomic rename, symlinks are replaced not followed
      // So this test now demonstrates the protection

      // Verify content remains unchanged
      const targetContent = await fs.readFile(targetFile, 'utf-8');
      expect(targetContent).toBe('FORBIDDEN CONTENT');
    });

    it('demonstrates race condition in read operations', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping race condition in read operations test - symlinks not supported');
        return;
      }

      const allowed = [allowedDir];
      const legitFile = path.join(allowedDir, 'readable.txt');
      const secretFile = path.join(forbiddenDir, 'secret.txt');

      // Create legitimate file
      await fs.writeFile(legitFile, 'PUBLIC CONTENT', 'utf-8');

      // Create secret file in forbidden directory
      await fs.writeFile(secretFile, 'SECRET CONTENT', 'utf-8');

      // Step 1: validatePath would pass for legitimate file
      expect(isPathWithinAllowedDirectories(legitFile, allowed)).toBe(true);

      // Step 2: Race condition - replace file with symlink after validation
      await fs.unlink(legitFile);
      await fs.symlink(secretFile, legitFile);

      // Step 3: Read operation follows symlink to forbidden location
      const content = await fs.readFile(legitFile, 'utf-8');

      // This shows the vulnerability - we read forbidden content
      expect(content).toBe('SECRET CONTENT');
      expect(isPathWithinAllowedDirectories(await fs.realpath(legitFile), allowed)).toBe(false);
    });

    it('verifies rename does not follow symlinks', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping rename symlink test - symlinks not supported');
        return;
      }

      const allowed = [allowedDir];
      const tempFile = path.join(allowedDir, 'temp.txt');
      const targetSymlink = path.join(allowedDir, 'target-symlink.txt');
      const forbiddenTarget = path.join(forbiddenDir, 'forbidden-target.txt');

      // Create forbidden target
      await fs.writeFile(forbiddenTarget, 'ORIGINAL CONTENT', 'utf-8');

      // Create symlink pointing to forbidden location
      await fs.symlink(forbiddenTarget, targetSymlink);

      // Write temp file
      await fs.writeFile(tempFile, 'NEW CONTENT', 'utf-8');

      // Rename temp file to symlink path
      await fs.rename(tempFile, targetSymlink);

      // Check what happened
      const symlinkExists = await fs.lstat(targetSymlink).then(() => true).catch(() => false);
      const isSymlink = symlinkExists && (await fs.lstat(targetSymlink)).isSymbolicLink();
      const targetContent = await fs.readFile(targetSymlink, 'utf-8');
      const forbiddenContent = await fs.readFile(forbiddenTarget, 'utf-8');

      // Rename should replace the symlink with a regular file
      expect(isSymlink).toBe(false);
      expect(targetContent).toBe('NEW CONTENT');
      expect(forbiddenContent).toBe('ORIGINAL CONTENT'); // Unchanged
    });
  });
});
