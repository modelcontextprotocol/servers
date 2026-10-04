// The version filesystem reports in serverInfo is its package.json version
// (#4472, which settles #360 for this server): changesets bumps package.json
// only, so a literal in the source would drift at the first "Version
// Packages" PR. The wire-level check is in server-tools.test.ts; this file
// covers how version.ts finds package.json, including when it cannot.

import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePackageVersion, SERVER_VERSION } from "../version.js";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

afterEach(() => {
  vi.doUnmock("node:module");
  vi.resetModules();
});

describe("resolvePackageVersion", () => {
  it("reads the version from package.json", () => {
    expect(SERVER_VERSION).toBe(packageJson.version);
    expect(resolvePackageVersion()).toBe(packageJson.version);
  });

  it("throws when no candidate package.json has a version", async () => {
    vi.doMock("node:module", () => ({
      // The first candidate is missing, the second has no version field.
      createRequire: () => {
        let calls = 0;
        return () => {
          calls += 1;
          if (calls === 1) throw new Error("Cannot find module");
          return {};
        };
      },
    }));
    vi.resetModules();
    await expect(import("../version.js")).rejects.toThrow(
      "Could not locate package.json for server version",
    );
  });
});
