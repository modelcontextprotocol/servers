import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePackageVersion } from '../version.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
const readFileSyncMock = vi.mocked(readFileSync);

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const { version } = JSON.parse(actualFs.readFileSync(join(packageRoot, 'package.json'), 'utf8'));

/** fs errors carry a `code`; only ENOENT/ENOTDIR mean "not at this path". */
const fsError = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  readFileSyncMock.mockReset();
  readFileSyncMock.mockImplementation(actualFs.readFileSync);
});

describe('resolvePackageVersion', () => {
  it('reports the version from package.json', () => {
    expect(resolvePackageVersion()).toBe(version);
  });

  it('does not fall back while the manifest is readable', () => {
    expect(resolvePackageVersion('unused-fallback')).toBe(version);
  });

  it('falls back when no manifest is found', () => {
    readFileSyncMock.mockImplementation(() => {
      throw fsError('ENOENT');
    });

    expect(resolvePackageVersion('1.2.3-fallback')).toBe('1.2.3-fallback');
  });

  it('falls back to 0.0.0-dev by default', () => {
    readFileSyncMock.mockImplementation(() => {
      throw fsError('ENOENT');
    });

    expect(resolvePackageVersion()).toBe('0.0.0-dev');
  });

  it('checks the parent directory, covering the dist/ layout', () => {
    readFileSyncMock
      .mockImplementationOnce(() => {
        throw fsError('ENOENT');
      })
      .mockImplementationOnce(() => JSON.stringify({ version: '9.9.9' }));

    expect(resolvePackageVersion()).toBe('9.9.9');
  });

  it('treats ENOTDIR as a missing manifest', () => {
    readFileSyncMock
      .mockImplementationOnce(() => {
        throw fsError('ENOTDIR');
      })
      .mockImplementationOnce(() => JSON.stringify({ version: '8.8.8' }));

    expect(resolvePackageVersion()).toBe('8.8.8');
  });

  it('skips a manifest that has no version field', () => {
    readFileSyncMock
      .mockImplementationOnce(() => JSON.stringify({ name: 'no-version-here' }))
      .mockImplementationOnce(() => JSON.stringify({ version: '7.7.7' }));

    expect(resolvePackageVersion()).toBe('7.7.7');
  });

  it('stops searching at the package root', () => {
    readFileSyncMock.mockImplementation(() => {
      throw fsError('ENOENT');
    });

    resolvePackageVersion();

    expect(readFileSyncMock).toHaveBeenCalledTimes(2);
  });

  it('propagates errors other than a missing manifest', () => {
    const denied = fsError('EACCES');
    readFileSyncMock.mockImplementation(() => {
      throw denied;
    });

    expect(() => resolvePackageVersion()).toThrow(denied);
  });

  it('propagates a malformed manifest', () => {
    readFileSyncMock.mockImplementation(() => '{ "version": ');

    expect(() => resolvePackageVersion()).toThrow(SyntaxError);
  });
});
