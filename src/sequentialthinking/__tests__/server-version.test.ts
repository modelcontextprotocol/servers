import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolvePackageVersion, SERVER_VERSION } from '../version.js';

const packageJson = createRequire(import.meta.url)('../package.json') as { version: string };
const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distVersionPath = path.join(packageRoot, 'dist', 'version.js');
const distIndexPath = path.join(packageRoot, 'dist', 'index.js');

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

  it.skipIf(!existsSync(distIndexPath))(
    'stdio initialize reports package.json version in serverInfo',
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [distIndexPath],
        cwd: packageRoot,
        stderr: 'pipe',
      });
      const client = new Client({ name: 'version-smoke', version: '0.0.0' });

      try {
        await client.connect(transport);
        const serverInfo = client.getServerVersion();
        expect(serverInfo?.name).toBe('sequential-thinking-server');
        expect(serverInfo?.version).toBe(packageJson.version);
        expect(serverInfo?.version).not.toBe('0.2.0');
      } finally {
        await client.close();
      }
    },
  );
});
