import { describe, it, expect } from '@jest/globals';
import { quotePath, normalizePath, expandHome, convertToWindowsPath } from '../path-utils.js';

describe('Path Utilities', () => {
  describe('quotePath', () => {
    it('adds quotes to paths with spaces', () => {
      expect(quotePath('C:\\NS\\My Kindle Content')).toBe('"C:\\NS\\My Kindle Content"');
      expect(quotePath('C:/NS/My Kindle Content')).toBe('"C:/NS/My Kindle Content"');
    });

    it('leaves paths without spaces unquoted', () => {
      expect(quotePath('C:\\Windows')).toBe('C:\\Windows');
      expect(quotePath('C:/Windows')).toBe('C:/Windows');
    });
  });

  describe('convertToWindowsPath', () => {
    it('converts WSL paths to Windows format', () => {
      expect(convertToWindowsPath('/mnt/c/NS/MyKindleContent'))
        .toBe('C:\\NS\\MyKindleContent');
    });

    it('converts Unix-style Windows paths to Windows format', () => {
      expect(convertToWindowsPath('/c/NS/MyKindleContent'))
        .toBe('C:\\NS\\MyKindleContent');
    });

    it('leaves Windows paths unchanged', () => {
      expect(convertToWindowsPath('C:\\NS\\MyKindleContent'))
        .toBe('C:\\NS\\MyKindleContent');
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
