// Tests for the memory server's startup path (#4854): main() run in-process
// over an in-memory transport, so its MEMORY_FILE_PATH handling is covered,
// and isMainModule(), the guard that keeps importing index.ts from starting a
// stdio server. The bin itself is exercised over real stdio by
// stdio-smoke.test.ts.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { isMainModule, main } from "../index.js";
import { call, makeTempGraph, readFileText } from "./helpers.js";

describe("main", () => {
  let originalEnv: string | undefined;
  let dir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    originalEnv = process.env.MEMORY_FILE_PATH;
    ({ dir, cleanup } = await makeTempGraph());
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.MEMORY_FILE_PATH;
    } else {
      process.env.MEMORY_FILE_PATH = originalEnv;
    }
    vi.restoreAllMocks();
    await cleanup();
  });

  it("serves the graph file MEMORY_FILE_PATH names and logs a banner", async () => {
    const graphPath = path.join(dir, "custom-graph.jsonl");
    process.env.MEMORY_FILE_PATH = graphPath;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "memory-test-client", version: "0.0.0" });

    const server = await main(serverTransport);
    await client.connect(clientTransport);
    try {
      expect(client.getServerVersion()?.name).toBe("memory-server");
      await call(client, "create_entities", {
        entities: [{ name: "Alice", entityType: "person", observations: [] }],
      });
      expect(await readFileText(graphPath)).toBe(
        '{"type":"entity","name":"Alice","entityType":"person","observations":[]}\n',
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "Knowledge Graph MCP Server running on stdio",
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});

describe("isMainModule", () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  let modulePath: string;

  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempGraph());
    modulePath = path.join(dir, "index.js");
    await fs.writeFile(modulePath, "");
  });

  afterEach(async () => {
    await cleanup();
  });

  it("is false when imported by the test runner", () => {
    expect(isMainModule()).toBe(false);
  });

  it("is true when the entry path is the module itself", () => {
    expect(isMainModule(modulePath, pathToFileURL(modulePath).href)).toBe(true);
  });

  it("is true when the entry path is a symlink to the module, as npm's bin is", async () => {
    const link = path.join(dir, "mcp-server-memory");
    await fs.symlink(modulePath, link);
    expect(isMainModule(link, pathToFileURL(modulePath).href)).toBe(true);
  });

  it("is false for another file", async () => {
    const other = path.join(dir, "other.js");
    await fs.writeFile(other, "");
    expect(isMainModule(other, pathToFileURL(modulePath).href)).toBe(false);
  });

  it("is false when the entry path does not exist", () => {
    expect(
      isMainModule(
        path.join(dir, "missing.js"),
        pathToFileURL(modulePath).href,
      ),
    ).toBe(false);
  });

  it("is false when there is no entry path, as in a REPL", () => {
    // An explicit undefined would select the default (the runner's argv[1]),
    // so pass the other falsy string a missing entry can arrive as.
    expect(isMainModule("", pathToFileURL(modulePath).href)).toBe(false);
  });
});
