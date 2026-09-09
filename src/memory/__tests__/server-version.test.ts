import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolvePackageVersion, SERVER_VERSION } from '../version.js';

const packageJson = createRequire(import.meta.url)('../package.json') as { version: string };

describe('server version', () => {
  it('uses package.json version for serverInfo', () => {
    expect(SERVER_VERSION).toBe(packageJson.version);
    expect(resolvePackageVersion()).toBe(packageJson.version);
  });

  it('resolves package.json from the dist layout', () => {
    const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
    const distVersionPath = path.join(distDir, 'version.js');

    expect(() => createRequire(distVersionPath)('./version.js')).not.toThrow();
    const distModule = createRequire(distVersionPath)('./version.js') as {
      SERVER_VERSION: string;
    };
    expect(distModule.SERVER_VERSION).toBe(packageJson.version);
  });
});
