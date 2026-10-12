// The one spawn-based test: boots the built binary (dist/index.js) over stdio
// and checks it answers, directly and through a symlink as npx runs it. Every
// behavior is tested in-process elsewhere; this only proves the published
// entry point starts and serves the same server. It needs a build, so it is
// skipped when dist/ is absent (`npm run validate` builds before testing).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};
const packageRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distIndexPath = path.join(packageRoot, "dist", "index.js");

describe.skipIf(!existsSync(distIndexPath))("stdio binary smoke", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "seqthink-bin-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function smoke(script: string): Promise<void> {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [script],
      cwd: packageRoot,
      env: { DISABLE_THOUGHT_LOGGING: "true" },
      stderr: "pipe",
    });
    const client = new Client({ name: "stdio-smoke", version: "0.0.0" });
    try {
      await client.connect(transport);
      expect(client.getServerVersion()).toEqual({
        name: "sequential-thinking-server",
        version: packageJson.version,
      });
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(["sequentialthinking"]);
      const result = await client.callTool({
        name: "sequentialthinking",
        arguments: {
          thought: "t",
          nextThoughtNeeded: false,
          thoughtNumber: 1,
          totalThoughts: 1,
        },
      });
      expect(result.structuredContent).toEqual({
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        branches: [],
        thoughtHistoryLength: 1,
      });
    } finally {
      await client.close();
    }
  }

  it("serves the tool when run directly", async () => {
    await smoke(distIndexPath);
  });

  it("serves the tool when run through a symlink, as npx does", async () => {
    const link = path.join(dir, "mcp-server-sequential-thinking");
    symlinkSync(distIndexPath, link);
    await smoke(link);
  });
});
