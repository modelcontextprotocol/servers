import { createRequire } from "node:module";
import path from "path";
import { fileURLToPath } from "url";

// moduleUrl is where to start looking. The server always uses this module's
// own URL; a test passes another so it can reach the fallback and the error.
export function resolvePackageVersion(
  moduleUrl: string = import.meta.url,
): string {
  const require = createRequire(moduleUrl);
  const moduleDir = path.dirname(fileURLToPath(moduleUrl));
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
