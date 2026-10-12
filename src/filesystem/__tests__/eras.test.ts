// Access control on both protocol eras (#4852). main() serves createServer()
// through the SDK's serveStdio entry, so the first message a client sends
// picks the connection's era. On 2025-11-25 a client that supports Roots
// replaces the command-line directories after initialize, as before. On
// 2026-07-28 there is no initialize and no server-to-client roots/list, and
// Roots is deprecated, so the command-line directories are the whole
// allow-list: a client's roots are never asked for and never widen it, and a
// server started with none says so on every call.
//
// The SDK-client tests serve createServer() exactly as main() does, over an
// in-memory transport; the raw tests drive main() itself over in-memory
// stdio, so its era wiring is covered too.

import fs from "fs/promises";
import path from "path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Client,
  InMemoryTransport,
  type CallToolResult,
} from "@modelcontextprotocol/client";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { main } from "../index.js";
import {
  createServer,
  NO_ALLOWED_DIRECTORIES_MODERN_ERROR,
} from "../server.js";
import { makeTempDir, quietStderr } from "./helpers.js";

let allowed: string;
let other: string;
let closers: Array<() => Promise<void>>;

beforeEach(async () => {
  quietStderr();
  allowed = await fs.realpath(await makeTempDir("mcp-fs-era-allowed-"));
  other = await fs.realpath(await makeTempDir("mcp-fs-era-other-"));
  await fs.writeFile(path.join(other, "secret.txt"), "secret");
  closers = [];
});

afterEach(async () => {
  for (const close of closers.reverse()) await close();
  vi.restoreAllMocks();
  await fs.rm(allowed, { recursive: true, force: true });
  await fs.rm(other, { recursive: true, force: true });
});

/**
 * A client that supports Roots and offers `other` as its only root, connected
 * to a server for `directories` and negotiating per `mode`.
 */
async function connect(
  directories: string[],
  mode: "auto" | "legacy",
): Promise<{ client: Client; rootsAsked: () => number }> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const handle = serveStdio(({ era }) => createServer(directories, { era }), {
    transport: serverTransport,
  });
  const client = new Client(
    { name: "fs-era-test", version: "0.0.0" },
    { capabilities: { roots: {} }, versionNegotiation: { mode } },
  );
  let asked = 0;
  client.setRequestHandler("roots/list", async () => {
    asked++;
    return { roots: [{ uri: `file://${other}`, name: "other" }] };
  });
  await client.connect(clientTransport);
  closers.push(
    () => handle.close(),
    () => client.close(),
  );
  return { client, rootsAsked: () => asked };
}

async function listAllowed(client: Client): Promise<string> {
  const result = (await client.callTool({
    name: "list_allowed_directories",
    arguments: {},
  })) as CallToolResult;
  return (result.content[0] as { text: string }).text;
}

describe("on 2026-07-28", () => {
  it("serves only the command-line directories, and never asks for roots", async () => {
    const { client, rootsAsked } = await connect([allowed], "auto");
    expect(client.getProtocolEra()).toBe("modern");
    expect(await listAllowed(client)).toBe(`Allowed directories:\n${allowed}`);
    const read = (await client.callTool({
      name: "read_text_file",
      arguments: { path: path.join(other, "secret.txt") },
    })) as CallToolResult;
    expect(read.isError).toBe(true);
    expect((read.content[0] as { text: string }).text).toContain(
      "Access denied",
    );
    expect(rootsAsked()).toBe(0);
  });

  it("explains on every call that a server with no directories cannot operate", async () => {
    const { client } = await connect([], "auto");
    const result = (await client.callTool({
      name: "list_allowed_directories",
      arguments: {},
    })) as CallToolResult;
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: NO_ALLOWED_DIRECTORIES_MODERN_ERROR }],
    });
  });
});

describe("on 2025-11-25", () => {
  it("still lets the client's roots replace the command-line directories", async () => {
    const { client, rootsAsked } = await connect([allowed], "legacy");
    expect(client.getProtocolEra()).toBe("legacy");
    await vi.waitFor(() => expect(rootsAsked()).toBe(1));
    expect(await listAllowed(client)).toBe(`Allowed directories:\n${other}`);
  });
});

describe("main() over stdio", () => {
  const envelope = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": { roots: {} },
  };

  /** Start main() and send one raw 2026-07-28 tools/call; resolve its result. */
  async function callOverStdio(args: string[]) {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    stdout.setEncoding("utf8");
    const handle = await main(args, stdin, stdout);
    closers.push(() => handle.close());
    const line = new Promise<string>((resolve) => {
      let buffered = "";
      stdout.on("data", (chunk: string) => {
        buffered += chunk;
        const newline = buffered.indexOf("\n");
        if (newline !== -1) resolve(buffered.slice(0, newline));
      });
    });
    stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          _meta: envelope,
          name: "list_allowed_directories",
          arguments: {},
        },
      })}\n`,
    );
    return JSON.parse(await line) as {
      result: CallToolResult & { resultType: string };
    };
  }

  it("answers a 2026-07-28 request with no initialize", async () => {
    const { result } = await callOverStdio([allowed]);
    expect(result.resultType).toBe("complete");
    expect(result.content).toEqual([
      { type: "text", text: `Allowed directories:\n${allowed}` },
    ]);
  });

  it("reports a transport error on stderr", async () => {
    const stderr = quietStderr();
    const stdin = new PassThrough();
    const handle = await main([allowed], stdin, new PassThrough());
    closers.push(() => handle.close());
    const failure = new Error("stdin broke");
    stdin.emit("error", failure);
    expect(stderr).toHaveBeenCalledWith("Transport error:", failure);
    // The failure is in the exit status too; reset it so the run is not failed.
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it("fails each 2026-07-28 call visibly when started with no directories", async () => {
    const { result } = await callOverStdio([]);
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: NO_ALLOWED_DIRECTORIES_MODERN_ERROR },
    ]);
  });
});
