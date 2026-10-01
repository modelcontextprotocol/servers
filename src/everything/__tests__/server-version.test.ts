// The version `everything` reports in `serverInfo` is its package.json version
// (#4472). Changesets bumps package.json only, so a literal in the source would
// drift at the first "Version Packages" PR; this drives the server through a
// client and reads what `initialize` actually returns.

import { describe, it, expect } from "vitest";
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
