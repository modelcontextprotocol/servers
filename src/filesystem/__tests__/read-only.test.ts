// Read-only mode (#632, #1160): `--read-only` on the command line, or
// `readOnly` in createServer's options, serves only the tools whose
// annotations declare `readOnlyHint: true`. The write tools are not merely
// refused at call time but absent, so a client never lists them. These tests
// pin the exact read-only tool set on both protocol eras, prove a write tool
// cannot be called and leaves the disk untouched, and drive the flag through
// main() so the command-line wiring is covered too.

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
import { main, parseArgs } from "../index.js";
import { createServer } from "../server.js";
import { makeTempDir, quietStderr } from "./helpers.js";

// Every tool that cannot change the filesystem. A tool added to the server
// must be added here if it is read-only; a write tool is withheld without any
// change, which is the point of keying the mode on the annotation.
const READ_ONLY_TOOLS = [
  "directory_tree",
  "get_file_info",
  "list_allowed_directories",
  "list_directory",
  "list_directory_with_sizes",
  "read_file",
  "read_media_file",
  "read_multiple_files",
  "read_text_file",
  "search_files",
];

let dir: string;
let stderr: ReturnType<typeof quietStderr>;
let closers: Array<() => Promise<void>>;

beforeEach(async () => {
  stderr = quietStderr();
  dir = await makeTempDir("mcp-fs-read-only-");
  await fs.writeFile(path.join(dir, "note.txt"), "original");
  closers = [];
});

afterEach(async () => {
  for (const close of closers.reverse()) await close();
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

/** A client connected to a server for `dir`, negotiating per `mode`. */
async function connect(
  readOnly: boolean,
  mode: "auto" | "legacy",
): Promise<Client> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const handle = serveStdio(
    ({ era }) => createServer([dir], { era, readOnly }),
    { transport: serverTransport },
  );
  const client = new Client(
    { name: "fs-read-only-test", version: "0.0.0" },
    { versionNegotiation: { mode } },
  );
  await client.connect(clientTransport);
  closers.push(
    () => handle.close(),
    () => client.close(),
  );
  return client;
}

describe.each([
  ["2026-07-28", "auto"],
  ["2025-11-25", "legacy"],
] as const)("read-only mode on %s", (_label, mode) => {
  it("lists only the read-only tools, each annotated readOnlyHint: true", async () => {
    const client = await connect(true, mode);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(READ_ONLY_TOOLS);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  it("withholds exactly the tools not annotated read-only", async () => {
    const full = await connect(false, mode);
    const { tools } = await full.listTools();
    const writeTools = tools
      .filter((tool) => tool.annotations?.readOnlyHint !== true)
      .map((tool) => tool.name);
    expect(writeTools).toEqual(
      expect.arrayContaining([
        "write_file",
        "edit_file",
        "create_directory",
        "move_file",
      ]),
    );
    const readOnly = await connect(true, mode);
    const listed = (await readOnly.listTools()).tools.map((t) => t.name);
    for (const name of writeTools) expect(listed).not.toContain(name);
  });

  it("refuses a call to a write tool and leaves the file untouched", async () => {
    const client = await connect(true, mode);
    const target = path.join(dir, "note.txt");
    const result = (await client
      .callTool({
        name: "write_file",
        arguments: { path: target, content: "changed" },
      })
      .catch((error: unknown) => ({
        isError: true,
        content: [{ type: "text", text: String(error) }],
      }))) as CallToolResult;
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/write_file/);
    expect(await fs.readFile(target, "utf8")).toBe("original");
  });

  it("still serves the read tools", async () => {
    const client = await connect(true, mode);
    const result = (await client.callTool({
      name: "read_text_file",
      arguments: { path: path.join(dir, "note.txt") },
    })) as CallToolResult;
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: "original" }]);
  });
});

describe("parseArgs", () => {
  it("takes every argument as a directory when no option is given", () => {
    expect(parseArgs(["/a", "/b"])).toEqual({
      directories: ["/a", "/b"],
      readOnly: false,
    });
  });

  it("recognizes --read-only before, between or after the directories", () => {
    for (const args of [
      ["--read-only", "/a", "/b"],
      ["/a", "--read-only", "/b"],
      ["/a", "/b", "--read-only"],
    ]) {
      expect(parseArgs(args)).toEqual({
        directories: ["/a", "/b"],
        readOnly: true,
      });
    }
  });

  it("treats everything after -- as a directory", () => {
    expect(parseArgs(["--read-only", "--", "--read-only", "/a"])).toEqual({
      directories: ["--read-only", "/a"],
      readOnly: true,
    });
  });
});

describe("main() with --read-only", () => {
  it("serves only the read-only tools over stdio and says so on stderr", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    stdout.setEncoding("utf8");
    const handle = await main(["--read-only", dir], stdin, stdout);
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
        method: "tools/list",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      })}\n`,
    );
    const { result } = JSON.parse(await line) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(result.tools.map((tool) => tool.name).sort()).toEqual(
      READ_ONLY_TOOLS,
    );
    expect(stderr).toHaveBeenCalledWith(
      "Read-only mode: only tools that cannot change the filesystem are served",
    );
  });

  it("prints usage when --read-only is the only argument", async () => {
    const handle = await main(
      ["--read-only"],
      new PassThrough(),
      new PassThrough(),
    );
    closers.push(() => handle.close());
    expect(stderr).toHaveBeenCalledWith(
      "Usage: mcp-server-filesystem [--read-only] [allowed-directory] [additional-directories...]",
    );
  });
});
