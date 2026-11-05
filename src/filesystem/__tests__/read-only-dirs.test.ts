// Per-directory read-only access (#5348): `--read-only-dir <path>` marks one
// allowed directory read-only while the others stay writable. These tests
// drive a real Client on both protocol eras and pin that every write tool is
// still listed, that each one refuses a target inside a read-only directory
// (move_file on both ends, copy_file on its destination) and leaves the disk
// untouched, that writes elsewhere still work, and that neither a symlink nor
// a 2025-era client's Roots lift the marking. validatePath's access mode, the
// command-line parsing and main()'s wiring are pinned directly.

import fs from "fs/promises";
import path from "path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Client,
  InMemoryTransport,
  type CallToolResult,
} from "@modelcontextprotocol/client";
import type { Root } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { main, parseArgs } from "../index.js";
import { validatePath } from "../lib.js";
import {
  assertWritable,
  describeReadOnlyDirectories,
  findReadOnlyDirectory,
  resolveReadOnlyDirectories,
} from "../read-only-directories.js";
import { createServer } from "../server.js";
import { call, makeTempDir, quietStderr, textOf } from "./helpers.js";

const WRITE_TOOLS = [
  "append_file",
  "copy_file",
  "create_directory",
  "edit_file",
  "move_file",
  "write_file",
];

let writable: string;
let protectedDir: string;
let stderr: ReturnType<typeof quietStderr>;
let closers: Array<() => Promise<void>>;

beforeEach(async () => {
  stderr = quietStderr();
  writable = await makeTempDir("mcp-fs-rw-");
  protectedDir = await makeTempDir("mcp-fs-ro-");
  await fs.writeFile(path.join(protectedDir, "keep.txt"), "original\n");
  await fs.writeFile(path.join(writable, "scratch.txt"), "scratch\n");
  closers = [];
});

afterEach(async () => {
  for (const close of closers.reverse()) await close();
  vi.restoreAllMocks();
  await fs.rm(writable, { recursive: true, force: true });
  await fs.rm(protectedDir, { recursive: true, force: true });
});

/** A client for a server allowing `directories`, with `readOnly` marked. */
async function connect(
  mode: "auto" | "legacy",
  directories: string[] = [writable, protectedDir],
  readOnlyDirectories: string[] = [protectedDir],
): Promise<Client> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const handle = serveStdio(
    ({ era }) => createServer(directories, { era, readOnlyDirectories }),
    { transport: serverTransport },
  );
  const client = new Client(
    { name: "fs-read-only-dirs-test", version: "0.0.0" },
    { versionNegotiation: { mode } },
  );
  await client.connect(clientTransport);
  closers.push(
    () => handle.close(),
    () => client.close(),
  );
  return client;
}

/** Call a tool and expect the read-only refusal naming `directory`. */
async function expectRefused(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  directory: string = protectedDir,
): Promise<void> {
  const result: CallToolResult = await call(client, name, args);
  expect(result.isError).toBe(true);
  expect(textOf(result)).toContain("Access denied - read-only directory");
  expect(textOf(result)).toContain(`is in ${directory}`);
}

const keep = () => path.join(protectedDir, "keep.txt");
const keepContent = () => fs.readFile(keep(), "utf8");

describe.each([
  ["2026-07-28", "auto"],
  ["2025-11-25", "legacy"],
] as const)("--read-only-dir on %s", (_label, mode) => {
  it("keeps every write tool listed", async () => {
    const client = await connect(mode);
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(WRITE_TOOLS));
  });

  it("refuses write_file, append_file and edit_file in the read-only directory", async () => {
    const client = await connect(mode);
    await expectRefused(client, "write_file", {
      path: keep(),
      content: "changed",
    });
    await expectRefused(client, "write_file", {
      path: path.join(protectedDir, "new.txt"),
      content: "new",
    });
    await expectRefused(client, "append_file", {
      path: keep(),
      content: "more",
    });
    await expectRefused(client, "edit_file", {
      path: keep(),
      edits: [{ oldText: "original", newText: "changed" }],
    });
    await expectRefused(client, "edit_file", {
      path: keep(),
      edits: [{ oldText: "original", newText: "changed" }],
      dryRun: true,
    });
    expect(await keepContent()).toBe("original\n");
    await expect(
      fs.access(path.join(protectedDir, "new.txt")),
    ).rejects.toThrow();
  });

  it("refuses create_directory in, and of, the read-only directory", async () => {
    const client = await connect(mode);
    await expectRefused(client, "create_directory", {
      path: path.join(protectedDir, "sub", "deeper"),
    });
    await expectRefused(client, "create_directory", { path: protectedDir });
    await expect(fs.access(path.join(protectedDir, "sub"))).rejects.toThrow();
  });

  it("refuses move_file out of and into the read-only directory", async () => {
    const client = await connect(mode);
    await expectRefused(client, "move_file", {
      source: keep(),
      destination: path.join(writable, "stolen.txt"),
    });
    await expectRefused(client, "move_file", {
      source: path.join(writable, "scratch.txt"),
      destination: path.join(protectedDir, "dropped.txt"),
    });
    expect(await keepContent()).toBe("original\n");
    expect(await fs.readFile(path.join(writable, "scratch.txt"), "utf8")).toBe(
      "scratch\n",
    );
  });

  it("copies out of the read-only directory but never into it", async () => {
    const client = await connect(mode);
    const copied = await call(client, "copy_file", {
      source: keep(),
      destination: path.join(writable, "copy.txt"),
    });
    expect(copied.isError).toBeFalsy();
    expect(await fs.readFile(path.join(writable, "copy.txt"), "utf8")).toBe(
      "original\n",
    );
    await expectRefused(client, "copy_file", {
      source: path.join(writable, "scratch.txt"),
      destination: path.join(protectedDir, "copy.txt"),
    });
    await expect(
      fs.access(path.join(protectedDir, "copy.txt")),
    ).rejects.toThrow();
  });

  it("still writes to the other directories and reads the read-only one", async () => {
    const client = await connect(mode);
    const target = path.join(writable, "out.txt");
    const written = await call(client, "write_file", {
      path: target,
      content: "ok",
    });
    expect(written.isError).toBeFalsy();
    expect(await fs.readFile(target, "utf8")).toBe("ok");
    const read = await call(client, "read_text_file", { path: keep() });
    expect(textOf(read)).toBe("original\n");
  });

  it("refuses a write through a symlink that leads into the read-only directory", async () => {
    await fs.symlink(protectedDir, path.join(writable, "link"));
    const client = await connect(mode);
    await expectRefused(client, "write_file", {
      path: path.join(writable, "link", "keep.txt"),
      content: "changed",
    });
    expect(await keepContent()).toBe("original\n");
  });

  it("makes a writable directory nested inside a read-only one read-only too", async () => {
    const nested = path.join(protectedDir, "nested");
    await fs.mkdir(nested);
    const client = await connect(mode, [protectedDir, nested], [protectedDir]);
    await expectRefused(client, "write_file", {
      path: path.join(nested, "x.txt"),
      content: "x",
    });
  });

  it("protects a read-only directory nested inside a writable one", async () => {
    const nested = path.join(writable, "vault");
    await fs.mkdir(nested);
    const client = await connect(mode, [writable], [nested]);
    await expectRefused(
      client,
      "write_file",
      { path: path.join(nested, "x.txt"), content: "x" },
      nested,
    );
    const beside = await call(client, "write_file", {
      path: path.join(writable, "x.txt"),
      content: "x",
    });
    expect(beside.isError).toBeFalsy();
  });

  it("names the read-only directories in list_allowed_directories", async () => {
    const client = await connect(mode);
    const text = textOf(await call(client, "list_allowed_directories"));
    expect(text).toBe(
      `Allowed directories:\n${writable}\n${protectedDir}\n\n${describeReadOnlyDirectories([protectedDir])}`,
    );
  });
});

describe("--read-only-dir with a 2025-era client's Roots", () => {
  function rootOf(dir: string): Root {
    return { uri: pathToFileURL(dir).href, name: path.basename(dir) };
  }

  it("keeps the marking when Roots replace the command-line directories", async () => {
    const server = createServer([writable, protectedDir], {
      readOnlyDirectories: [protectedDir],
    });
    const client = new Client(
      { name: "fs-read-only-dirs-roots", version: "0.0.0" },
      { capabilities: { roots: { listChanged: true } } },
    );
    // A root that contains the read-only directory replaces both directories.
    client.setRequestHandler("roots/list", async () => ({
      roots: [rootOf(path.dirname(protectedDir))],
    }));
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    closers.push(async () => {
      await client.close();
      await server.close();
    });
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining("which replaced the command-line directories"),
      ),
    );
    await expectRefused(client, "write_file", {
      path: keep(),
      content: "changed",
    });
    expect(await keepContent()).toBe("original\n");
  });
});

describe("validatePath's access mode", () => {
  it("admits a read and refuses a write inside a read-only directory", async () => {
    const allowed = [writable, protectedDir];
    await expect(validatePath(keep(), allowed, "read")).resolves.toBe(keep());
    await expect(
      validatePath(keep(), allowed, "write", [protectedDir]),
    ).rejects.toThrow("Access denied - read-only directory");
    await expect(
      validatePath(path.join(writable, "a.txt"), allowed, "write", [
        protectedDir,
      ]),
    ).resolves.toBe(path.join(writable, "a.txt"));
  });

  it("does not treat a sibling sharing a prefix as read-only", () => {
    expect(findReadOnlyDirectory("/data/ro-other/x", ["/data/ro"])).toBe(
      undefined,
    );
    expect(findReadOnlyDirectory("/data/ro/x", ["/data/ro"])).toBe("/data/ro");
    expect(() =>
      assertWritable("/data/ro-other/x", ["/data/ro"]),
    ).not.toThrow();
  });
});

describe("resolveReadOnlyDirectories", () => {
  it("keeps both spellings of a symlinked directory", async () => {
    const link = path.join(writable, "alias");
    await fs.symlink(protectedDir, link);
    expect(await resolveReadOnlyDirectories([link])).toEqual([
      link,
      protectedDir,
    ]);
  });

  it("lists a directory once", async () => {
    expect(
      await resolveReadOnlyDirectories([protectedDir, protectedDir]),
    ).toEqual([protectedDir]);
  });

  it("keeps a directory that does not exist yet", async () => {
    const missing = path.join(writable, "later");
    expect(await resolveReadOnlyDirectories([missing])).toEqual([missing]);
  });
});

describe("parseArgs with --read-only-dir", () => {
  it("collects each --read-only-dir, wherever it appears", () => {
    expect(
      parseArgs(["/a", "--read-only-dir", "/b", "--read-only-dir", "/c"]),
    ).toEqual({
      directories: ["/a"],
      readOnly: false,
      confineRoots: false,
      readOnlyDirectories: ["/b", "/c"],
    });
  });

  it("takes the next argument as the directory, whatever it looks like", () => {
    expect(
      parseArgs(["--read-only-dir", "--read-only"]).readOnlyDirectories,
    ).toEqual(["--read-only"]);
  });

  it("treats --read-only-dir after -- as a directory", () => {
    expect(parseArgs(["--", "--read-only-dir", "/b"])).toEqual({
      directories: ["--read-only-dir", "/b"],
      readOnly: false,
      confineRoots: false,
      readOnlyDirectories: [],
    });
  });

  it("refuses --read-only-dir with no directory after it", () => {
    expect(() => parseArgs(["/a", "--read-only-dir"])).toThrow(
      "--read-only-dir needs a directory after it",
    );
  });
});

describe("main() with --read-only-dir", () => {
  it("allows the directory, logs the marking and refuses a write over stdio", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    stdout.setEncoding("utf8");
    const handle = await main(
      ["--read-only-dir", protectedDir, writable],
      stdin,
      stdout,
    );
    closers.push(() => handle.close());
    expect(stderr).toHaveBeenCalledWith(
      describeReadOnlyDirectories([protectedDir]),
    );
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
          name: "write_file",
          arguments: { path: keep(), content: "changed" },
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      })}\n`,
    );
    const { result } = JSON.parse(await line) as { result: CallToolResult };
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      "Access denied - read-only directory",
    );
    expect(await keepContent()).toBe("original\n");
  });

  it("does not print usage when only --read-only-dir names a directory", async () => {
    const handle = await main(
      ["--read-only-dir", protectedDir],
      new PassThrough(),
      new PassThrough(),
    );
    closers.push(() => handle.close());
    expect(stderr).not.toHaveBeenCalledWith(
      expect.stringContaining("Usage: mcp-server-filesystem"),
    );
  });
});
