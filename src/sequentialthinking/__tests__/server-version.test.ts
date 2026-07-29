import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolvePackageVersion, SERVER_VERSION } from '../version.js';

const packageJson = createRequire(import.meta.url)('../package.json') as { version: string };
const distVersionPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'version.js',
);

describe('server version', () => {
  it('uses package.json version instead of a hardcoded string', () => {
    expect(SERVER_VERSION).toBe(packageJson.version);
    expect(resolvePackageVersion()).toBe(packageJson.version);
    expect(SERVER_VERSION).not.toBe('0.2.0');
  });

  // CI runs `npm test` before the dedicated build job. `npm ci` usually
  // materializes dist/ via prepare, but that is not guaranteed (e.g. local
  // `rm -rf dist && npm test`, or install with --ignore-scripts).
  it.skipIf(!existsSync(distVersionPath))(
    'resolves package.json from the dist layout after build',
    async () => {
      const distModule = (await import(pathToFileURL(distVersionPath).href)) as {
        SERVER_VERSION: string;
      };
      expect(distModule.SERVER_VERSION).toBe(packageJson.version);
    },
  );
});
