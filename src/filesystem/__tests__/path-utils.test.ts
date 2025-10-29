import { describe, it, expect, afterEach } from 'vitest';
import { normalizePath, expandHome, convertToWindowsPath } from '../path-utils.js';

describe('Path Utilities', () => {
  describe('convertToWindowsPath', () => {
    it('leaves Unix paths unchanged', () => {
      expect(convertToWindowsPath('/usr/local/bin'))
        .toBe('/usr/local/bin');
      expect(convertToWindowsPath('/home/user/some path'))
        .toBe('/home/user/some path');
    });

    it('never converts WSL paths (they work correctly in WSL with Node.js fs)', () => {
      // WSL paths should NEVER be converted, regardless of platform
      // They are valid Linux paths that work with Node.js fs operations inside WSL
      expect(convertToWindowsPath('/mnt/c/NS/MyKindleContent'))
        .toBe('/mnt/c/NS/MyKindleContent');
      expect(convertToWindowsPath('/mnt/d/Documents'))
        .toBe('/mnt/d/Documents');
    });

    it('converts Unix-style Windows paths only on Windows platform', () => {
      // On Windows, /c/ style paths should be converted
      if (process.platform === 'win32') {
        expect(convertToWindowsPath('/c/NS/MyKindleContent'))
          .toBe('C:\\NS\\MyKindleContent');
      } else {
        // On Linux, leave them unchanged
        expect(convertToWindowsPath('/c/NS/MyKindleContent'))
          .toBe('/c/NS/MyKindleContent');
      }
    });

    it('leaves Windows paths unchanged but ensures backslashes', () => {
      expect(convertToWindowsPath('C:\\NS\\MyKindleContent'))
        .toBe('C:\\NS\\MyKindleContent');
      expect(convertToWindowsPath('C:/NS/MyKindleContent'))
        .toBe('C:\\NS\\MyKindleContent');
    });

    it('handles Windows paths with spaces', () => {
      expect(convertToWindowsPath('C:\\Program Files\\Some App'))
        .toBe('C:\\Program Files\\Some App');
      expect(convertToWindowsPath('C:/Program Files/Some App'))
        .toBe('C:\\Program Files\\Some App');
    });

    it('handles drive letter paths based on platform', () => {
      // WSL paths should never be converted
      expect(convertToWindowsPath('/mnt/d/some/path'))
        .toBe('/mnt/d/some/path');

      if (process.platform === 'win32') {
        // On Windows, Unix-style paths like /d/ should be converted
        expect(convertToWindowsPath('/d/some/path'))
          .toBe('D:\\some\\path');
      } else {
        // On Linux, /d/ is just a regular Unix path
        expect(convertToWindowsPath('/d/some/path'))
          .toBe('/d/some/path');
      }
    });
  });

  describe('normalizePath', () => {
    it('preserves Unix paths', () => {
      expect(normalizePath('/usr/local/bin'))
        .toBe('/usr/local/bin');
      expect(normalizePath('/home/user/some path'))
        .toBe('/home/user/some path');
      expect(normalizePath('"/usr/local/some app/"'))
        .toBe('/usr/local/some app');
    });

    it('removes surrounding quotes', () => {
      expect(normalizePath('"C:\\NS\\My Kindle Content"'))
        .toBe('C:\\NS\\My Kindle Content');
    });

    it('normalizes backslashes', () => {
      expect(normalizePath('C:\\\\NS\\\\MyKindleContent'))
        .toBe('C:\\NS\\MyKindleContent');
    });

    it('converts forward slashes to backslashes on Windows', () => {
      expect(normalizePath('C:/NS/MyKindleContent'))
        .toBe('C:\\NS\\MyKindleContent');
    });

    it('always preserves WSL paths (they work correctly in WSL)', () => {
      // WSL paths should ALWAYS be preserved, regardless of platform
      // This is the fix for issue #2795
      expect(normalizePath('/mnt/c/NS/MyKindleContent'))
        .toBe('/mnt/c/NS/MyKindleContent');
      expect(normalizePath('/mnt/d/Documents'))
        .toBe('/mnt/d/Documents');
    });

    it('handles Unix-style Windows paths', () => {
      // On Windows, /c/ paths should be converted
      if (process.platform === 'win32') {
        expect(normalizePath('/c/NS/MyKindleContent'))
          .toBe('C:\\NS\\MyKindleContent');
      } else if (process.platform === 'linux') {
        // On Linux, /c/ is just a regular Unix path
        expect(normalizePath('/c/NS/MyKindleContent'))
          .toBe('/c/NS/MyKindleContent');
      }
    });

    it('handles paths with spaces and mixed slashes', () => {
      expect(normalizePath('C:/NS/My Kindle Content'))
        .toBe('C:\\NS\\My Kindle Content');
      // WSL paths should always be preserved
      expect(normalizePath('/mnt/c/NS/My Kindle Content'))
        .toBe('/mnt/c/NS/My Kindle Content');
      expect(normalizePath('C:\\Program Files (x86)\\App Name'))
        .toBe('C:\\Program Files (x86)\\App Name');
      expect(normalizePath('"C:\\Program Files\\App Name"'))
        .toBe('C:\\Program Files\\App Name');
      expect(normalizePath('  C:\\Program Files\\App Name  '))
        .toBe('C:\\Program Files\\App Name');
    });

    it('preserves spaces in all path formats', () => {
      // WSL paths should always be preserved
      expect(normalizePath('/mnt/c/Program Files/App Name'))
        .toBe('/mnt/c/Program Files/App Name');

      if (process.platform === 'win32') {
        // On Windows, Unix-style paths like /c/ should be converted
        expect(normalizePath('/c/Program Files/App Name'))
          .toBe('C:\\Program Files\\App Name');
      } else {
        // On Linux, /c/ is just a regular Unix path
        expect(normalizePath('/c/Program Files/App Name'))
          .toBe('/c/Program Files/App Name');
      }
      expect(normalizePath('C:/Program Files/App Name'))
        .toBe('C:\\Program Files\\App Name');
    });

    it('handles special characters in paths', () => {
      // Test ampersand in path
      expect(normalizePath('C:\\NS\\Sub&Folder'))
        .toBe('C:\\NS\\Sub&Folder');
      expect(normalizePath('C:/NS/Sub&Folder'))
        .toBe('C:\\NS\\Sub&Folder');
      // WSL paths should always be preserved
      expect(normalizePath('/mnt/c/NS/Sub&Folder'))
        .toBe('/mnt/c/NS/Sub&Folder');

      // Test tilde in path (short names in Windows)
      expect(normalizePath('C:\\NS\\MYKIND~1'))
        .toBe('C:\\NS\\MYKIND~1');
      expect(normalizePath('/Users/NEMANS~1/FOLDER~2/SUBFO~1/Public/P12PST~1'))
        .toBe('/Users/NEMANS~1/FOLDER~2/SUBFO~1/Public/P12PST~1');

      // Test other special characters
      expect(normalizePath('C:\\Path with #hash'))
        .toBe('C:\\Path with #hash');
      expect(normalizePath('C:\\Path with (parentheses)'))
        .toBe('C:\\Path with (parentheses)');
      expect(normalizePath('C:\\Path with [brackets]'))
        .toBe('C:\\Path with [brackets]');
      expect(normalizePath('C:\\Path with @at+plus$dollar%percent'))
        .toBe('C:\\Path with @at+plus$dollar%percent');
    });

    it('capitalizes lowercase drive letters for Windows paths', () => {
      expect(normalizePath('c:/windows/system32'))
        .toBe('C:\\windows\\system32');
      // WSL paths should always be preserved
      expect(normalizePath('/mnt/d/my/folder'))
        .toBe('/mnt/d/my/folder');

      if (process.platform === 'win32') {
        // On Windows, Unix-style paths should be converted and capitalized
        expect(normalizePath('/e/another/folder'))
          .toBe('E:\\another\\folder');
      } else {
        // On Linux, /e/ is just a regular Unix path
        expect(normalizePath('/e/another/folder'))
          .toBe('/e/another/folder');
      }
    });

    it('handles UNC paths correctly', () => {
      // UNC paths should preserve the leading double backslash
      const uncPath = '\\\\SERVER\\share\\folder';
      expect(normalizePath(uncPath)).toBe('\\\\SERVER\\share\\folder');
      
      // Test UNC path with double backslashes that need normalization
      const uncPathWithDoubles = '\\\\\\\\SERVER\\\\share\\\\folder';
      expect(normalizePath(uncPathWithDoubles)).toBe('\\\\SERVER\\share\\folder');
    });

    it('returns normalized non-Windows/WSL/Unix-style Windows paths as is after basic normalization', () => {
      // A path that looks somewhat absolute but isn't a drive or recognized Unix root for Windows conversion
      // These paths should be preserved as-is (not converted to Windows C:\ format or WSL format)
      const otherAbsolutePath = '\\someserver\\share\\file';
      expect(normalizePath(otherAbsolutePath)).toBe(otherAbsolutePath);
    });
  });

  describe('expandHome', () => {
    it('expands ~ to home directory', () => {
      const result = expandHome('~/test');
      expect(result).toContain('test');
      expect(result).not.toContain('~');
    });

    it('expands bare ~ to home directory', () => {
      const result = expandHome('~');
      expect(result).not.toContain('~');
      expect(result.length).toBeGreaterThan(0);
    });

    it('leaves other paths unchanged', () => {
      expect(expandHome('C:/test')).toBe('C:/test');
    });
  });

  describe('WSL path handling (issue #2795 fix)', () => {
    // Save original platform
    const originalPlatform = process.platform;

    afterEach(() => {
      // Restore platform after each test
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
        configurable: true
      });
    });

    it('should NEVER convert WSL paths - they work correctly in WSL with Node.js fs', () => {
      // The key insight: When running `wsl npx ...`, Node.js runs INSIDE WSL (process.platform === 'linux')
      // and /mnt/c/ paths work correctly with Node.js fs operations in that environment.
      // Converting them to C:\ format breaks fs operations because Windows paths don't work inside WSL.

      // Mock Linux platform (inside WSL)
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true
      });

      // WSL paths should NOT be converted, even inside WSL
      expect(normalizePath('/mnt/c/Users/username/folder'))
        .toBe('/mnt/c/Users/username/folder');

      expect(normalizePath('/mnt/d/Documents/project'))
        .toBe('/mnt/d/Documents/project');
    });

    it('should also preserve WSL paths when running on Windows', () => {
      // Mock Windows platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true
      });

      // WSL paths should still be preserved (though they wouldn't be accessible from Windows Node.js)
      expect(normalizePath('/mnt/c/Users/username/folder'))
        .toBe('/mnt/c/Users/username/folder');

      expect(normalizePath('/mnt/d/Documents/project'))
        .toBe('/mnt/d/Documents/project');
    });

    it('should convert Unix-style Windows paths (/c/) only when running on Windows (win32)', () => {
      // Mock process.platform to be 'win32' (Windows)
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true
      });

      // Unix-style Windows paths like /c/ should be converted on Windows
      expect(normalizePath('/c/Users/username/folder'))
        .toBe('C:\\Users\\username\\folder');

      expect(normalizePath('/d/Documents/project'))
        .toBe('D:\\Documents\\project');
    });

    it('should NOT convert Unix-style paths (/c/) when running inside WSL (linux)', () => {
      // Mock process.platform to be 'linux' (WSL/Linux)
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true
      });

      // When on Linux, /c/ is just a regular Unix directory, not a drive letter
      expect(normalizePath('/c/some/path'))
        .toBe('/c/some/path');

      expect(normalizePath('/d/another/path'))
        .toBe('/d/another/path');
    });

    it('should preserve regular Unix paths on all platforms', () => {
      // Test on Linux
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true
      });

      expect(normalizePath('/home/user/documents'))
        .toBe('/home/user/documents');

      expect(normalizePath('/var/log/app'))
        .toBe('/var/log/app');

      // Test on Windows (though these paths wouldn't work on Windows)
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true
      });

      expect(normalizePath('/home/user/documents'))
        .toBe('/home/user/documents');

      expect(normalizePath('/var/log/app'))
        .toBe('/var/log/app');
    });

    it('reproduces exact scenario from issue #2795', () => {
      // Simulate running inside WSL: wsl npx @modelcontextprotocol/server-filesystem /mnt/c/Users/username/folder
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true
      });

      // This is the exact path from the issue
      const inputPath = '/mnt/c/Users/username/folder';
      const result = normalizePath(inputPath);

      // Should NOT convert to C:\Users\username\folder
      expect(result).toBe('/mnt/c/Users/username/folder');
      expect(result).not.toContain('C:');
      expect(result).not.toContain('\\');
    });

    it('should handle relative path slash conversion based on platform', () => {
      // This test verifies platform-specific behavior naturally without mocking
      // On Windows: forward slashes converted to backslashes
      // On Linux/Unix: forward slashes preserved
      const relativePath = 'some/relative/path';
      const result = normalizePath(relativePath);

      if (originalPlatform === 'win32') {
        expect(result).toBe('some\\relative\\path');
      } else {
        expect(result).toBe('some/relative/path');
      }
    });
  });
});
