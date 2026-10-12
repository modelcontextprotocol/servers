// A thin smoke test of the published entry point over real stdio (#4854).
// Everything else runs the server in-process; this spawns the built
// dist/index.js, as an MCP client does, to prove the bin starts, that the
// isMainModule() guard lets it start when run through a symlink (as npm's
// node_modules/.bin entry is), and that it honours MEMORY_FILE_PATH.
// It runs the last build: run `npm run build` first, as `validate` does.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { call, makeTempGraph, readFileText } from "./helpers.js";

const distIndexPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "index.js",
);

describe("stdio smoke test of dist/index.js", () => {
  let dir: string;
  let filePath: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ dir, filePath, cleanup } = await makeTempGraph());
  });

  afterEach(async () => {
    await cleanup();
  });

  async function smoke(entry: string) {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      env: { MEMORY_FILE_PATH: filePath },
      stderr: "pipe",
    });
    const client = new Client({ name: "memory-smoke", version: "0.0.0" });
    try {
      await client.connect(transport);
      expect(client.getServerVersion()?.name).toBe("memory-server");
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(9);
      const result = await call(client, "create_entities", {
        entities: [{ name: "Alice", entityType: "person", observations: [] }],
      });
      expect(result.isError).toBeUndefined();
      expect(await readFileText(filePath)).toBe(
        '{"type":"entity","name":"Alice","entityType":"person","observations":[]}\n',
      );
    } finally {
      await client.close();
    }
  }

  it("starts, lists its tools and writes to MEMORY_FILE_PATH", async () => {
    await smoke(distIndexPath);
  });

  it("starts when run through a symlink, as npm's bin is", async () => {
    const link = path.join(dir, "mcp-server-memory");
    await fs.symlink(distIndexPath, link);
    await smoke(link);
  });
});
