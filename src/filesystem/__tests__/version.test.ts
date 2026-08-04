import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePackageVersion, SERVER_VERSION } from '../version.js';

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return { ...actual, createRequire: vi.fn(actual.createRequire) };
});

const actualModule = await vi.importActual<typeof import('node:module')>('node:module');
const createRequireMock = vi.mocked(createRequire);

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { version } = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));

/** A `require` that fails to find a module carries this code; anything else is a real failure. */
const moduleNotFound = () =>
  Object.assign(new Error('Cannot find module'), { code: 'MODULE_NOT_FOUND' });

/** Stands in for the `require` returned by createRequire, driven by `impl`. */
const stubRequire = (impl: (id: string) => unknown) =>
  impl as unknown as ReturnType<typeof createRequire>;

beforeEach(() => {
  createRequireMock.mockReset();
  createRequireMock.mockImplementation(actualModule.createRequire);
});

describe('resolvePackageVersion', () => {
  it('reports the version from package.json', () => {
    expect(resolvePackageVersion()).toBe(version);
  });

  it('exposes the resolved version as SERVER_VERSION', () => {
    expect(SERVER_VERSION).toBe(version);
  });

  it('falls through to the parent directory, covering the dist/ layout', () => {
    const seen: string[] = [];
    createRequireMock.mockReturnValue(
      stubRequire((id) => {
        seen.push(id);
        if (seen.length === 1) throw moduleNotFound();
        return { version: '9.9.9' };
      }),
    );

    expect(resolvePackageVersion()).toBe('9.9.9');
    expect(seen).toHaveLength(2);
  });

  it('skips a manifest that has no version field', () => {
    let call = 0;
    createRequireMock.mockReturnValue(
      stubRequire(() => (++call === 1 ? { name: 'no-version-here' } : { version: '7.7.7' })),
    );

    expect(resolvePackageVersion()).toBe('7.7.7');
  });

  it('throws when no manifest is found, without searching past the package root', () => {
    const seen: string[] = [];
    createRequireMock.mockReturnValue(
      stubRequire((id) => {
        seen.push(id);
        throw moduleNotFound();
      }),
    );

    expect(() => resolvePackageVersion()).toThrow(
      'Could not locate package.json for server version',
    );
    expect(seen).toHaveLength(2);
  });

  it('propagates errors other than a missing manifest', () => {
    const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    createRequireMock.mockReturnValue(
      stubRequire(() => {
        throw denied;
      }),
    );

    expect(() => resolvePackageVersion()).toThrow(denied);
  });

  it('propagates a malformed manifest instead of reporting it as missing', () => {
    createRequireMock.mockReturnValue(
      stubRequire(() => {
        throw new SyntaxError('Unexpected end of JSON input');
      }),
    );

    expect(() => resolvePackageVersion()).toThrow(SyntaxError);
  });
});
