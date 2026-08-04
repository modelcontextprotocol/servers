import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolvePackageVersion } from '../version.js';

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

// The cases above drive the resolver directly; these exercise the real build.
// They skip when dist/ is absent so an unbuilt tree still passes.
const distVersionPath = path.join(packageRoot, 'dist', 'version.js');
const distIndexPath = path.join(packageRoot, 'dist', 'index.js');

describe('built output', () => {
  it.skipIf(!existsSync(distVersionPath))(
    'resolves package.json from the dist layout after build',
    async () => {
      const dist = await import(/* @vite-ignore */ pathToFileURL(distVersionPath).href);

      expect(dist.SERVER_VERSION).toBe(version);
    },
  );

  it.skipIf(!existsSync(distIndexPath))(
    'stdio initialize reports package.json version in serverInfo',
    async () => {
      const client = new Client({ name: 'version-test', version: '1.0.0' }, { capabilities: {} });
      await client.connect(
        new StdioClientTransport({ command: process.execPath, args: [distIndexPath] }),
      );

      try {
        expect(client.getServerVersion()?.version).toBe(version);
      } finally {
        await client.close();
      }
    },
  );
});
