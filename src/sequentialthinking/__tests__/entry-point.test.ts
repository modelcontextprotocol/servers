// The in-process half of the entry point: `main()` connects a server to the
// transport it is given, and `isEntryPoint()` decides whether index.ts was run
// as the binary (and so attaches stdio) or merely imported, as these tests do.
// The bootstrap that calls them only runs in a spawned process, which
// stdio-smoke.test.ts covers.

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { isEntryPoint, main } from "../index.js";

const indexUrl = new URL("../index.ts", import.meta.url).href;
const indexPath = fileURLToPath(indexUrl);

describe("main", () => {
  let errorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("serves the tool on the given transport and announces itself on stderr", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "main-test", version: "0.0.0" });
    try {
      await Promise.all([
        main(serverTransport),
        client.connect(clientTransport),
      ]);
      expect(errorSpy).toHaveBeenCalledWith(
        "Sequential Thinking MCP Server running on stdio",
      );
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(["sequentialthinking"]);
    } finally {
      await client.close();
    }
  });

  it("rejects when the transport cannot start", async () => {
    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    vi.spyOn(serverTransport, "start").mockRejectedValue(new Error("no pipe"));
    await expect(main(serverTransport)).rejects.toThrow("no pipe");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("isEntryPoint", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "seqthink-entry-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("is false when the module is imported (argv[1] is the test runner)", () => {
    expect(isEntryPoint(indexUrl, process.argv[1])).toBe(false);
  });

  it("is false with no argv[1]", () => {
    expect(isEntryPoint(indexUrl, undefined)).toBe(false);
    expect(isEntryPoint(indexUrl, "")).toBe(false);
  });

  it("is true when argv[1] is the module itself", () => {
    expect(isEntryPoint(indexUrl, indexPath)).toBe(true);
  });

  it("is true when argv[1] is a symlink to the module, as npx and .bin use", () => {
    const link = path.join(dir, "mcp-server-sequential-thinking");
    symlinkSync(indexPath, link);
    expect(isEntryPoint(indexUrl, link)).toBe(true);
  });

  it("is false when argv[1] does not exist", () => {
    expect(isEntryPoint(indexUrl, path.join(dir, "missing.js"))).toBe(false);
  });

  it("is false when the module URL does not resolve to a file", () => {
    expect(
      isEntryPoint(pathToFileURL(path.join(dir, "gone.js")).href, indexPath),
    ).toBe(false);
  });
});
