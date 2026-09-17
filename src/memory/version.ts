import { createRequire } from 'node:module';
import path from 'path';
import { fileURLToPath } from 'url';

export function resolvePackageVersion(): string {
  const require = createRequire(import.meta.url);
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, 'package.json'),
    path.join(moduleDir, '..', 'package.json'),
  ];

  for (const candidate of candidates) {
    try {
      const pkg = require(candidate) as { version?: string };
      if (pkg.version) {
        return pkg.version;
      }
    } catch {
      // Try the next candidate when running from dist/ or source.
    }
  }

  throw new Error('Could not locate package.json for server version');
}

export const SERVER_VERSION = resolvePackageVersion();
