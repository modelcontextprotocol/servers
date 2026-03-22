import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { validatePath, setAllowedDirectories, setSymlinkPolicy, getSymlinkPolicy } from '../lib.js';
import { normalizePath } from '../path-utils.js';

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
    
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      return false;
    }
    throw error;
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

let symlinkSupported: boolean | null = null;

async function getSymlinkSupport(): Promise<boolean> {
  if (symlinkSupported === null) {
    symlinkSupported = await checkSymlinkSupport();
    if (!symlinkSupported) {
      console.log('\n⚠️  Symlink tests will be skipped - symlink creation not supported in this environment');
    }
  }
  return symlinkSupported;
}

/**
 * Helper to resolve allowed directories similar to index.ts logic
 * Handles macOS /var -> /private/var symlinks
 */
async function resolveAllowedDirectories(dir: string): Promise<string[]> {
  const absolute = path.resolve(dir);
  const normalizedOriginal = normalizePath(absolute);
  try {
    const resolved = await fs.realpath(absolute);
    const normalizedResolved = normalizePath(resolved);
    if (normalizedOriginal !== normalizedResolved) {
      return [normalizedOriginal, normalizedResolved];
    }
    return [normalizedResolved];
  } catch {
    return [normalizedOriginal];
  }
}

describe('Symlink Policy', () => {
  let testDir: string;
  let allowedDir: string;
  let forbiddenDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'symlink-policy-test-'));
    allowedDir = path.join(testDir, 'allowed');
    forbiddenDir = path.join(testDir, 'forbidden');

    await fs.mkdir(allowedDir, { recursive: true });
    await fs.mkdir(forbiddenDir, { recursive: true });
    
    // Set allowed directories using helper that handles macOS symlinks
    const resolvedAllowedDirs = await resolveAllowedDirectories(allowedDir);
    setAllowedDirectories(resolvedAllowedDirs);
    
    // Reset symlink policy to default
    setSymlinkPolicy({ follow: false, maxDepth: 1 });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Default behavior (followSymlinks: false)', () => {
    it('blocks symlink pointing outside allowed directories by default', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping - symlinks not supported');
        return;
      }

      // Create target file outside allowed directory
      const targetFile = path.join(forbiddenDir, 'target.txt');
      await fs.writeFile(targetFile, 'content');

      // Create symlink inside allowed directory pointing to forbidden file
      const linkPath = path.join(allowedDir, 'link.txt');
      await fs.symlink(targetFile, linkPath);

      // Default behavior should block the symlink
      await expect(validatePath(linkPath)).rejects.toThrow(/symlink target outside allowed directories/);
    });

    it('allows symlink within allowed directories', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping - symlinks not supported');
        return;
      }

      // Create target file inside allowed directory
      const targetFile = path.join(allowedDir, 'target.txt');
      await fs.writeFile(targetFile, 'content');

      // Create symlink to file within allowed directory
      const linkPath = path.join(allowedDir, 'link.txt');
      await fs.symlink(targetFile, linkPath);

      // Should pass validation (path should resolve correctly, can be /private/ version on macOS)
      const result = await validatePath(linkPath);
      expect(result).toBeTruthy();
    });

    it('blocks regular files outside allowed directories', async () => {
      const outsideFile = path.join(forbiddenDir, 'file.txt');
      await fs.writeFile(outsideFile, 'content');

      // Should throw because path is outside allowed directories
      await expect(validatePath(outsideFile)).rejects.toThrow(/path outside allowed directories/);
    });
  });

  describe('With followSymlinks: true', () => {
    beforeEach(() => {
      setSymlinkPolicy({ follow: true, maxDepth: 1 });
    });

    it('allows symlink outside allowed dir with depth 1', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping - symlinks not supported');
        return;
      }

      const targetFile = path.join(forbiddenDir, 'target.txt');
      await fs.writeFile(targetFile, 'content');

      const linkPath = path.join(allowedDir, 'link.txt');
      await fs.symlink(targetFile, linkPath);

      // Should pass with default maxDepth of 1
      const result = await validatePath(linkPath);
      expect(result).toBe(targetFile);
    });

    it('allows symlink pointing to file within allowed directory', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping - symlinks not supported');
        return;
      }

      const targetFile = path.join(allowedDir, 'target.txt');
      await fs.writeFile(targetFile, 'content');

      const linkPath = path.join(allowedDir, 'link.txt');
      await fs.symlink(targetFile, linkPath);

      const result = await validatePath(linkPath);
      expect(result).toBeTruthy();
    });

    it('blocks symlink chain exceeding max depth', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping - symlinks not supported');
        return;
      }

      // Set max depth to 1
      setSymlinkPolicy({ follow: true, maxDepth: 1 });

      // Create a chain: allowed/link -> forbidden/link1 -> forbidden/link2 -> target
      const targetFile = path.join(forbiddenDir, 'target.txt');
      await fs.writeFile(targetFile, 'content');

      const link1 = path.join(forbiddenDir, 'link1');
      const link2 = path.join(forbiddenDir, 'link2');
      const finalLink = path.join(allowedDir, 'final-link');

      await fs.symlink(targetFile, link1);
      await fs.symlink(link1, link2);
      await fs.symlink(link2, finalLink);

      // Chain has 2 hops outside allowed dirs, exceeds maxDepth of 1
      await expect(validatePath(finalLink)).rejects.toThrow(/exceeded max depth of 1/);
    });

    it('allows symlink chain within max depth', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping - symlinks not supported');
        return;
      }

      // Set max depth to 3 (to account for the chain)
      setSymlinkPolicy({ follow: true, maxDepth: 3 });

      const targetFile = path.join(forbiddenDir, 'target.txt');
      await fs.writeFile(targetFile, 'content');

      const link1 = path.join(forbiddenDir, 'link1');
      const link2 = path.join(forbiddenDir, 'link2');
      const finalLink = path.join(allowedDir, 'final-link');

      await fs.symlink(targetFile, link1);
      await fs.symlink(link1, link2);
      await fs.symlink(link2, finalLink);

      // Chain has 2 hops outside allowed dirs, within maxDepth of 3
      const result = await validatePath(finalLink);
      expect(result).toBeTruthy();
    });

    it('allows symlink that loops back into allowed dir after outside hop', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping - symlinks not supported');
        return;
      }

      // Create: allowed/link1 -> forbidden/link2 -> allowed/target
      const targetFile = path.join(allowedDir, 'target.txt');
      await fs.writeFile(targetFile, 'content');

      const outsideLink = path.join(forbiddenDir, 'outside-link');
      const finalLink = path.join(allowedDir, 'final-link');

      await fs.symlink(targetFile, outsideLink);
      await fs.symlink(outsideLink, finalLink);

      // Chain: hop 1 (outsideLink) is outside allowed dir = 1 hop
      // hop 2 (targetFile) is inside allowed dir = 0 additional hops outside
      // Total outside hops = 1, within maxDepth of 1
      const result = await validatePath(finalLink);
      expect(result).toBeTruthy();
    });

    it('blocks symlink that loops back after exceeding depth', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping - symlinks not supported');
        return;
      }

      // Set max depth to 1
      setSymlinkPolicy({ follow: true, maxDepth: 1 });

      // Create chain: allowed/link1 -> forbidden/link2 -> forbidden/link3 -> allowed/target
      const targetFile = path.join(allowedDir, 'target.txt');
      await fs.writeFile(targetFile, 'content');

      const link1 = path.join(forbiddenDir, 'link1');
      const link2 = path.join(forbiddenDir, 'link2');
      const finalLink = path.join(allowedDir, 'final-link');

      await fs.symlink(targetFile, link1);
      await fs.symlink(link1, link2);
      await fs.symlink(link2, finalLink);

      // Chain has 2 hops outside before reaching final target
      await expect(validatePath(finalLink)).rejects.toThrow(/exceeded max depth of 1/);
    });

    it('detects circular symlinks and throws', async () => {
      const symlinkSupported = await getSymlinkSupport();
      if (!symlinkSupported) {
        console.log('   ⏭️  Skipping - symlinks not supported');
        return;
      }

      // Add test dir to allowed directories for this test
      const resolvedDirs = await resolveAllowedDirectories(testDir);
      setAllowedDirectories(resolvedDirs);
      
      setSymlinkPolicy({ follow: true, maxDepth: 5 });

      // Create circular symlinks
      const linkA = path.join(testDir, 'link-a');
      const linkB = path.join(testDir, 'link-b');

      await fs.symlink(linkB, linkA);
      await fs.symlink(linkA, linkB);

      // Should detect circular symlink
      await expect(validatePath(linkA)).rejects.toThrow(/circular symlink detected/);
    });

    it('handles non-existent paths with symlink policy', async () => {
      setSymlinkPolicy({ follow: true, maxDepth: 1 });

      const newFilePath = path.join(allowedDir, 'newfile.txt');
      
      // Should return the path without error for new files in existing directory
      const result = await validatePath(newFilePath);
      expect(result).toBe(newFilePath);
    });
  });

  describe('getSymlinkPolicy', () => {
    it('returns current symlink policy', () => {
      setSymlinkPolicy({ follow: true, maxDepth: 5 });
      
      const policy = getSymlinkPolicy();
      expect(policy.follow).toBe(true);
      expect(policy.maxDepth).toBe(5);
    });

    it('returns default policy when not set', () => {
      // Reset to defaults
      setSymlinkPolicy({ follow: false, maxDepth: 1 });
      
      const policy = getSymlinkPolicy();
      expect(policy.follow).toBe(false);
      expect(policy.maxDepth).toBe(1);
    });
  });
});
