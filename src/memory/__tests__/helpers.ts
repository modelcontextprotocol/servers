// Shared harness for the memory server's protocol-level tests: builds a server
// with createServer(), links an SDK Client to it over an in-memory transport,
// and gives each test its own temporary graph file. Tests assert on what the
// client receives, so they hold across an SDK upgrade that keeps the wire
// format; nothing here reaches into SDK internals.
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { createServer } from "../index.js";

export interface Connection {
  client: Client;
  server: McpServer;
  serverTransport: InMemoryTransport;
  close: () => Promise<void>;
}

// Connect a fresh client to a fresh server over the graph file at filePath.
export async function connect(filePath: string): Promise<Connection> {
  const server = createServer(filePath);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "memory-test-client", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    server,
    serverTransport,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

// A temporary directory holding the graph file, removed by cleanup().
export async function makeTempGraph(): Promise<{
  dir: string;
  filePath: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-memory-test-"));
  return {
    dir,
    filePath: path.join(dir, "memory.jsonl"),
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}

// Call a tool and return its result typed as a CallToolResult. callTool's
// declared return type also admits the legacy toolResult shape, which this
// server never sends.
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

// The text of a result's single text content block.
export function textOf(result: CallToolResult): string {
  const [block] = result.content;
  if (result.content.length !== 1 || block.type !== "text") {
    throw new Error(
      `expected one text block, got ${JSON.stringify(result.content)}`,
    );
  }
  return block.text;
}

// The graph file's raw contents.
export function readFileText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}
