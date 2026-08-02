import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Only "manifest isn't here" is skippable; other errors propagate. */
const isMissingFile = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
};

/**
 * Reads this package's version from package.json. release.py stamps the version
 * at release time, so a literal in source is always stale.
 */
export const resolvePackageVersion = (fallback = "0.0.0-dev"): string => {
  const moduleDir = dirname(fileURLToPath(import.meta.url));

  // Manifest sits alongside this module from source, one level up from dist/.
  for (const dir of [moduleDir, dirname(moduleDir)]) {
    let manifest: string;
    try {
      manifest = readFileSync(join(dir, "package.json"), "utf8");
    } catch (error) {
      if (isMissingFile(error)) continue;
      throw error;
    }

    const { version } = JSON.parse(manifest);
    if (typeof version === "string") return version;
  }

  return fallback;
};
