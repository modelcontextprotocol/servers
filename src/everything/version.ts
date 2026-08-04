import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve this package's version from package.json.
 *
 * Works both from source (`src/everything/`) and from the published
 * layout (`dist/`), where package.json lives one directory up.
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
    } catch (error) {
      // Only a missing manifest is skippable; a corrupt or unreadable one is a real failure.
      if ((error as NodeJS.ErrnoException)?.code !== "MODULE_NOT_FOUND") {
        throw error;
      }
    }
  }

  throw new Error("Could not locate package.json for server version");
}

export const SERVER_VERSION = resolvePackageVersion();
