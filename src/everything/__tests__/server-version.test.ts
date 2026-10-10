// The version `everything` reports in `serverInfo` is its package.json version
// (#4472). Changesets bumps package.json only, so a literal in the source would
// drift at the first "Version Packages" PR; this drives the server through a
// client and reads what `initialize` actually returns.

import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server/index.js";
import { resolvePackageVersion, SERVER_VERSION } from "../version.js";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

describe("server version", () => {
  it("uses package.json version instead of a hardcoded string", () => {
    expect(SERVER_VERSION).toBe(packageJson.version);
    expect(resolvePackageVersion()).toBe(packageJson.version);
  });

  it("initialize reports package.json version in serverInfo", async () => {
    const { server, cleanup } = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "version-test", version: "0.0.0" });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const serverInfo = client.getServerVersion();
      expect(serverInfo?.name).toBe("mcp-servers/everything");
      expect(serverInfo?.version).toBe(packageJson.version);
    } finally {
      cleanup();
      await client.close();
      await server.close();
    }
  });
});

describe("resolvePackageVersion without a usable package.json", () => {
  it("skips a package.json with no version and one that cannot be read, then throws", async () => {
    vi.resetModules();
    vi.doMock("node:module", async (importOriginal) => {
      const real = await importOriginal<typeof import("node:module")>();
      let calls = 0;
      return {
        ...real,
        createRequire: () => () => {
          if (calls++ === 0) return {}; // the first candidate has no version
          throw new Error("not found"); // the second is missing
        },
      };
    });
    try {
      // SERVER_VERSION is resolved at import, so the import itself fails.
      await expect(import("../version.js")).rejects.toThrow(
        "Could not locate package.json for server version",
      );
    } finally {
      vi.doUnmock("node:module");
      vi.resetModules();
    }
  });
});
