import { describe, it, expect } from '@jest/globals';
import { normalizePath, expandHome, convertToWindowsPath } from '../path-utils.js';

describe('Path Utilities', () => {
  describe('convertToWindowsPath', () => {
    it('converts WSL paths to Windows format', () => {
      expect(convertToWindowsPath('/mnt/c/NS/MyKindleContent'))
        .toBe('C:\\NS\\MyKindleContent');
    });

    it('converts Unix-style Windows paths to Windows format', () => {
      expect(convertToWindowsPath('/c/NS/MyKindleContent'))
        .toBe('C:\\NS\\MyKindleContent');
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

    it('handles uppercase and lowercase drive letters', () => {
      expect(convertToWindowsPath('/mnt/d/some/path'))
        .toBe('D:\\some\\path');
      expect(convertToWindowsPath('/d/some/path'))
        .toBe('D:\\some\\path');
    });
  });

  describe('normalizePath', () => {
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

    it('handles WSL paths', () => {
      expect(normalizePath('/mnt/c/NS/MyKindleContent'))
        .toBe('C:\\NS\\MyKindleContent');
    });

    it('handles Unix-style Windows paths', () => {
      expect(normalizePath('/c/NS/MyKindleContent'))
        .toBe('C:\\NS\\MyKindleContent');
    });

    it('handles paths with spaces and mixed slashes', () => {
      expect(normalizePath('C:/NS/My Kindle Content'))
        .toBe('C:\\NS\\My Kindle Content');
      expect(normalizePath('/mnt/c/NS/My Kindle Content'))
        .toBe('C:\\NS\\My Kindle Content');
      expect(normalizePath('C:\\Program Files (x86)\\App Name'))
        .toBe('C:\\Program Files (x86)\\App Name');
      expect(normalizePath('"C:\\Program Files\\App Name"'))
        .toBe('C:\\Program Files\\App Name');
      expect(normalizePath('  C:\\Program Files\\App Name  '))
        .toBe('C:\\Program Files\\App Name');
    });

    it('preserves spaces in all path formats', () => {
      expect(normalizePath('/mnt/c/Program Files/App Name'))
        .toBe('C:\\Program Files\\App Name');
      expect(normalizePath('/c/Program Files/App Name'))
        .toBe('C:\\Program Files\\App Name');
      expect(normalizePath('C:/Program Files/App Name'))
        .toBe('C:\\Program Files\\App Name');
    });
  });

  describe('expandHome', () => {
    it('expands ~ to home directory', () => {
      const result = expandHome('~/test');
      expect(result).toContain('test');
      expect(result).not.toContain('~');
    });

    it('leaves other paths unchanged', () => {
      expect(expandHome('C:/test')).toBe('C:/test');
    });
  });
});
