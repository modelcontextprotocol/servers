// Shared harness for the filesystem protocol tests (#4854). It links a real
// SDK Client to a server built by createServer() over an in-memory transport,
// so every assertion is on what crosses the wire: the tool list, call results
// and errors. Tests touch only the public Client API and wire shapes, so the
// SDK v2 codemod can update them with import and type changes alone.

import fs from "fs/promises";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ListRootsRequestSchema,
  type CallToolResult,
  type ClientCapabilities,
  type Root,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../server.js";

export interface Connected {
  client: Client;
  close: () => Promise<void>;
}

export interface ConnectOptions {
  /** Client capabilities to declare; `roots` makes the server ask for roots. */
  capabilities?: ClientCapabilities;
  /** Answer for `roots/list`; installed only when `capabilities.roots` is set. */
  listRoots?: () => Root[] | Promise<Root[]>;
}

/** Build a server for `allowedDirectories` and connect a Client to it in-process. */
export async function connect(
  allowedDirectories: string[],
  options: ConnectOptions = {},
): Promise<Connected> {
  const server = createServer(allowedDirectories);
  const client = new Client(
    { name: "filesystem-test-client", version: "0.0.0" },
    { capabilities: options.capabilities ?? {} },
  );
  const { listRoots } = options;
  if (options.capabilities?.roots && listRoots) {
    client.setRequestHandler(ListRootsRequestSchema, async () => ({
      roots: await listRoots(),
    }));
  }
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** Call a tool and return its result, typed as a CallToolResult. */
export async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<CallToolResult> {
  return (await client.callTool({
    name,
    arguments: args,
  })) as CallToolResult;
}

/** The text of a result's single text content block. */
export function textOf(result: CallToolResult): string {
  const [block] = result.content;
  if (block?.type !== "text") {
    throw new Error(`expected a text block, got ${JSON.stringify(block)}`);
  }
  return block.text;
}

/** A fresh realpath'd temporary directory (macOS /var is a symlink). */
export async function makeTempDir(prefix: string): Promise<string> {
  return fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)));
}

/** Silence console.error for the current test; returns the spy to assert on. */
export function quietStderr() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

/** The allowed directories the server reports, one per line after the header. */
export async function allowedDirectoriesOf(client: Client): Promise<string[]> {
  const text = textOf(await call(client, "list_allowed_directories"));
  return text.split("\n").slice(1).filter(Boolean);
}
