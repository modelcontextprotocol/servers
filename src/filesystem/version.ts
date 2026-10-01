// The version this server reports in `serverInfo`, read from package.json so
// it cannot drift from the published version (#4472). The TypeScript servers
// are versioned by changesets, whose "Version Packages" PR edits only
// package.json and CHANGELOG.md: a version literal in the source would stay
// behind at the first bump. Same module as `memory` and `sequentialthinking`.

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve this package's version from package.json.
 *
 * Works both from source (`src/filesystem/`) and from the published layout
 * (`dist/`), where package.json lives one directory up.
 */
export function resolvePackageVersion(): string {
  const require = createRequire(import.meta.url);
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, "package.json"),
    path.join(moduleDir, "..", "package.json"),
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

  throw new Error("Could not locate package.json for server version");
}

export const SERVER_VERSION = resolvePackageVersion();
