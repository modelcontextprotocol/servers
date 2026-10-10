import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { resolvePackageVersion, SERVER_VERSION } from "../version.js";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

describe("server version", () => {
  it("uses package.json version for serverInfo", () => {
    expect(SERVER_VERSION).toBe(packageJson.version);
    expect(resolvePackageVersion()).toBe(packageJson.version);
  });

  it("resolves package.json from the dist layout", () => {
    const distDir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "dist",
    );
    const distVersionPath = path.join(distDir, "version.js");

    expect(() => createRequire(distVersionPath)("./version.js")).not.toThrow();
    const distModule = createRequire(distVersionPath)("./version.js") as {
      SERVER_VERSION: string;
    };
    expect(distModule.SERVER_VERSION).toBe(packageJson.version);
  });

  describe("resolving from another location", () => {
    let root: string;

    beforeEach(async () => {
      root = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-memory-version-"));
      await fs.mkdir(path.join(root, "dist"));
    });

    afterEach(async () => {
      await fs.rm(root, { recursive: true, force: true });
    });

    const moduleUrl = () =>
      pathToFileURL(path.join(root, "dist", "version.js")).href;

    it("falls back to the parent package.json when the nearer one has no version", async () => {
      await fs.writeFile(
        path.join(root, "dist", "package.json"),
        JSON.stringify({ type: "module" }),
      );
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ version: "9.8.7" }),
      );
      expect(resolvePackageVersion(moduleUrl())).toBe("9.8.7");
    });

    it("throws when neither candidate package.json exists", () => {
      expect(() => resolvePackageVersion(moduleUrl())).toThrow(
        "Could not locate package.json for server version",
      );
    });
  });
});
