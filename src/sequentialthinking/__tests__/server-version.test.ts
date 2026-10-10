// The server reports its version from package.json, never from a literal
// (AGENTS.md, Versions). `resolvePackageVersion()` tries the source layout and
// then the dist/ layout; these tests cover both, and the failure when neither
// yields a version, by substituting `createRequire` for that one case. The
// wire-level check (serverInfo.version) is in tools-list.test.ts and, for the
// built binary, stdio-smoke.test.ts.

import { describe, it, expect, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePackageVersion, SERVER_VERSION } from "../version.js";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};
const packageRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distVersionPath = path.join(packageRoot, "dist", "version.js");

describe("server version", () => {
  afterEach(() => {
    vi.doUnmock("node:module");
    vi.resetModules();
  });

  it("uses package.json version instead of a hardcoded string", () => {
    expect(SERVER_VERSION).toBe(packageJson.version);
    expect(resolvePackageVersion()).toBe(packageJson.version);
    expect(SERVER_VERSION).not.toBe("0.2.0");
  });

  // CI runs `npm test` before the dedicated build job. `npm ci` usually
  // materializes dist/ via prepare, but that is not guaranteed (e.g. local
  // `rm -rf dist && npm test`, or install with --ignore-scripts).
  it.skipIf(!existsSync(distVersionPath))(
    "resolves package.json from the dist layout after build",
    async () => {
      const distModule = (await import(
        pathToFileURL(distVersionPath).href
      )) as {
        SERVER_VERSION: string;
      };
      expect(distModule.SERVER_VERSION).toBe(packageJson.version);
    },
  );

  it("falls through to the parent directory, then throws when no package.json has a version", async () => {
    const tried: string[] = [];
    vi.doMock("node:module", () => ({
      createRequire: () => (id: string) => {
        tried.push(id);
        if (tried.length === 1) {
          throw new Error("Cannot find module");
        }
        return {};
      },
    }));
    vi.resetModules();
    await expect(import("../version.js")).rejects.toThrow(
      "Could not locate package.json for server version",
    );
    expect(tried.map((p) => path.relative(packageRoot, p))).toEqual([
      "package.json",
      path.join("..", "package.json"),
    ]);
  });
});
