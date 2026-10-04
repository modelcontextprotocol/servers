// The one spawn-based test (#4854): it launches the built bin the way a user
// does and checks that it boots, answers initialize with the package version
// and serves a tool. Everything else runs in-process, so this only guards the
// entry-point wiring that in-process tests cannot reach (the isEntryPoint
// guard and process stdio). It needs `dist/`, which `npm run validate` builds
// before testing; a bare `npm test` on a clean checkout skips it.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { makeTempDir } from "./helpers.js";

const packageRoot = path.join(import.meta.dirname, "..");
const distIndexPath = path.join(packageRoot, "dist", "index.js");
const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

describe("the built bin", () => {
  it.skipIf(!existsSync(distIndexPath))(
    "boots over stdio and serves a tool",
    async () => {
      const dir = await makeTempDir("mcp-fs-smoke-");
      const client = new Client({ name: "bin-smoke", version: "0.0.0" });
      try {
        await client.connect(
          new StdioClientTransport({
            command: process.execPath,
            args: [distIndexPath, dir],
            stderr: "pipe",
          }),
        );
        expect(client.getServerVersion()).toEqual({
          name: "secure-filesystem-server",
          version: packageJson.version,
        });
        const result = await client.callTool({
          name: "list_allowed_directories",
          arguments: {},
        });
        expect(result.structuredContent).toEqual({
          content: `Allowed directories:\n${dir}`,
        });
      } finally {
        await client.close();
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
  );
});
