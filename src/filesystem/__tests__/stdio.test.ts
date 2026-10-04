// The stdio entry point, in-process (#4854): main() takes argv and the stdio
// streams, so these tests run the real startup path (directory resolution,
// usage text, the exit on no usable directory) and the real
// StdioServerTransport over in-memory streams, writing raw JSON-RPC lines the
// way a client process would. Absorbs the former startup-validation.test.ts,
// which spawned the build. Pins #4206, #4207 and #4195 as they stand on SDK 1.x.

import fs from "fs/promises";
import os from "os";
import path from "path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isEntryPoint, main, resolveAllowedDirectories } from "../index.js";
import { makeTempDir, quietStderr } from "./helpers.js";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

/** A server started by main() over in-memory stdio, and a line-level client. */
class StdioSession {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  private buffered = "";
  private readonly responses = new Map<number, JsonRpcResponse>();
  server?: McpServer;

  constructor() {
    this.stdout.setEncoding("utf8");
    this.stdout.on("data", (chunk: string) => {
      this.buffered += chunk;
      let newline: number;
      while ((newline = this.buffered.indexOf("\n")) !== -1) {
        const line = this.buffered.slice(0, newline);
        this.buffered = this.buffered.slice(newline + 1);
        const message = JSON.parse(line) as JsonRpcResponse;
        this.responses.set(message.id, message);
      }
    });
  }

  async start(args: string[]): Promise<void> {
    this.server = await main(args, this.stdin, this.stdout);
  }

  writeLine(line: string): void {
    this.stdin.write(`${line}\n`);
  }

  send(id: number, method: string, params?: Record<string, unknown>): void {
    this.writeLine(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  }

  async response(id: number): Promise<JsonRpcResponse> {
    return vi.waitFor(() => {
      const message = this.responses.get(id);
      if (!message) throw new Error(`no response to ${id} yet`);
      return message;
    });
  }

  /** Ids answered so far, in arrival order. */
  answered(): number[] {
    return [...this.responses.keys()];
  }

  async initialize(): Promise<JsonRpcResponse> {
    this.send(1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "stdio-test", version: "0.0.0" },
    });
    const response = await this.response(1);
    this.writeLine(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    );
    return response;
  }

  async close(): Promise<void> {
    await this.server?.close();
  }
}

let dir: string;
let stderr: ReturnType<typeof quietStderr>;
let session: StdioSession;

beforeEach(async () => {
  stderr = quietStderr();
  dir = await makeTempDir("mcp-fs-stdio-");
  session = new StdioSession();
});

afterEach(async () => {
  await session.close();
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

function stderrText(): string {
  return stderr.mock.calls.map((args) => args.join(" ")).join("\n");
}

describe("startup", () => {
  it("serves over stdio with the directories from argv", async () => {
    await session.start([dir]);
    expect(stderr).toHaveBeenCalledWith(
      "Secure MCP Filesystem Server running on stdio",
    );
    const init = await session.initialize();
    expect(init.result?.serverInfo).toMatchObject({
      name: "secure-filesystem-server",
    });
    session.send(2, "tools/call", {
      name: "list_allowed_directories",
      arguments: {},
    });
    expect((await session.response(2)).result?.structuredContent).toEqual({
      content: `Allowed directories:\n${dir}`,
    });
  });

  it("prints usage, and waits for roots, when started with no directories", async () => {
    await session.start([]);
    expect(stderrText()).toContain(
      "Usage: mcp-server-filesystem [allowed-directory] [additional-directories...]",
    );
    expect(stderrText()).toContain(
      "At least one directory must be provided by EITHER method for the server to operate.",
    );
    expect(stderr).toHaveBeenCalledWith(
      "Started without allowed directories - waiting for client to provide roots via MCP protocol",
    );
  });

  it("skips a missing directory with a warning and keeps the rest", async () => {
    const missing = path.join(dir, "missing");
    const accessible = path.join(dir, "ok");
    await fs.mkdir(accessible);
    expect(await resolveAllowedDirectories([missing, accessible])).toEqual([
      accessible,
    ]);
    expect(stderr).toHaveBeenCalledWith(
      `Warning: Cannot access directory ${missing}, skipping`,
    );
  });

  it("skips a file with a warning", async () => {
    const file = path.join(dir, "file.txt");
    await fs.writeFile(file, "");
    expect(await resolveAllowedDirectories([file, dir])).toEqual([dir]);
    expect(stderr).toHaveBeenCalledWith(
      `Warning: ${file} is not a directory, skipping`,
    );
  });

  it("exits 1 when none of the given directories is usable", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    await expect(
      session.start([path.join(dir, "a"), path.join(dir, "b")]),
    ).rejects.toThrow("process.exit(1)");
    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr).toHaveBeenCalledWith(
      "Error: None of the specified directories are accessible",
    );
  });

  it("keeps both the given and the resolved path of a symlinked directory", async () => {
    const link = path.join(dir, "link");
    const target = path.join(dir, "target");
    await fs.mkdir(target);
    await fs.symlink(target, link);
    expect(await resolveAllowedDirectories([link])).toEqual([link, target]);
  });

  it("expands ~ to the home directory", async () => {
    const home = await fs.realpath(os.homedir());
    const resolved = await resolveAllowedDirectories(["~"]);
    expect(resolved[resolved.length - 1]).toBe(home);
  });
});

describe("the stdio transport", () => {
  // #4195: SDK 1.x does not enforce the lifecycle, so a request before
  // initialize is answered normally.
  it("answers tools/list before initialize (#4195)", async () => {
    await session.start([dir]);
    session.send(7, "tools/list");
    const response = await session.response(7);
    expect(response.error).toBeUndefined();
    expect(response.result?.tools).toHaveLength(14);
  });

  // #4206: a malformed line is reported to the transport's onerror (unset,
  // so silently) and skipped; the session keeps serving.
  it("skips a malformed line and keeps serving (#4206)", async () => {
    await session.start([dir]);
    session.writeLine('{"jsonrpc":"2.0", "method": "test", "params": ');
    await session.initialize();
    expect(session.answered()).toEqual([1]);
  });

  // #4207: a ~1 MiB line is under the SDK's 10 MiB read buffer, so it is
  // parsed and answered (here with method-not-found), and the session keeps
  // serving.
  it("answers a 1 MiB line and keeps serving (#4207)", async () => {
    await session.start([dir]);
    await session.initialize();
    session.send(9999, "echo", { data: "A".repeat(1024 * 1024) });
    expect((await session.response(9999)).error).toEqual({
      code: -32601,
      message: "Method not found",
    });
    session.send(3, "tools/list");
    expect((await session.response(3)).result?.tools).toHaveLength(14);
  });
});

describe("isEntryPoint", () => {
  const moduleUrl = pathToFileURL(
    path.join(import.meta.dirname, "..", "index.ts"),
  ).href;

  it("is true when argv[1] is the module itself", () => {
    expect(
      isEntryPoint(path.join(import.meta.dirname, "..", "index.ts"), moduleUrl),
    ).toBe(true);
  });

  it("is true when argv[1] is a symlink to the module, as an npm bin is", async () => {
    const link = path.join(dir, "mcp-server-filesystem");
    await fs.symlink(path.join(import.meta.dirname, "..", "index.ts"), link);
    expect(isEntryPoint(link, moduleUrl)).toBe(true);
  });

  it("is false for another script, a missing path, or no argv[1]", () => {
    expect(isEntryPoint(import.meta.filename, moduleUrl)).toBe(false);
    expect(isEntryPoint(path.join(dir, "missing.js"), moduleUrl)).toBe(false);
    expect(isEntryPoint(undefined, moduleUrl)).toBe(false);
  });
});
