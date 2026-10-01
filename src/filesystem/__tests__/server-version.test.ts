// The version `filesystem` reports in `serverInfo` is its package.json version
// (#4472). Changesets bumps package.json only, so a literal in the source would
// drift at the first "Version Packages" PR (it had already drifted: the server
// reported 0.2.0 while the package was 0.6.3). The server is a script that
// starts on import, so the protocol-level check drives the built entry point
// over stdio, as a client does.

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolvePackageVersion, SERVER_VERSION } from "../version.js";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};
const packageRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distIndexPath = path.join(packageRoot, "dist", "index.js");

describe("server version", () => {
  it("uses package.json version instead of a hardcoded string", () => {
    expect(SERVER_VERSION).toBe(packageJson.version);
    expect(resolvePackageVersion()).toBe(packageJson.version);
  });

  // `npm run validate` builds before it tests, so dist/ is there in the gate
  // and in CI; a bare `npm test` on a clean checkout has nothing to launch.
  it.skipIf(!existsSync(distIndexPath))(
    "stdio initialize reports package.json version in serverInfo",
    async () => {
      const allowedDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "fs-version-test-"),
      );
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [distIndexPath, allowedDir],
        cwd: packageRoot,
        stderr: "pipe",
      });
      const client = new Client({ name: "version-test", version: "0.0.0" });

      try {
        await client.connect(transport);
        const serverInfo = client.getServerVersion();
        expect(serverInfo?.name).toBe("secure-filesystem-server");
        expect(serverInfo?.version).toBe(packageJson.version);
      } finally {
        await client.close();
        await fs.rm(allowedDir, { recursive: true, force: true });
      }
    },
  );
});
