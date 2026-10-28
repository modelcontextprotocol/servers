// --confine-roots (#3133): a 2025-era client's Roots may narrow the operator's
// command-line directories but never replace or widen them. The overlap rule
// is pinned on confineRootsToDirectories directly; the protocol tests drive a
// real Client that answers roots/list over the in-memory transport and assert
// what the server then allows, logs and refuses, including the withdrawal and
// symlink cases the unconfined flow already guards. The 2026-07-28 era never
// asks for Roots, so there the flag changes nothing, which main() pins.

import fs from "fs/promises";
import path from "path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { Root } from "@modelcontextprotocol/server";
import {
  confineRootsToDirectories,
  describeAllowedDirectories,
} from "../allowed-directories.js";
import { main, parseArgs } from "../index.js";
import { createServer } from "../server.js";
import {
  allowedDirectoriesOf,
  call,
  makeTempDir,
  quietStderr,
  textOf,
} from "./helpers.js";

let base: string;
let outside: string;
let stderr: ReturnType<typeof quietStderr>;
let closers: Array<() => Promise<void>>;

beforeEach(async () => {
  stderr = quietStderr();
  base = await makeTempDir("mcp-fs-confine-base-");
  outside = await makeTempDir("mcp-fs-confine-outside-");
  await fs.mkdir(path.join(base, "inner"));
  await fs.writeFile(path.join(base, "inner", "in.txt"), "inside");
  await fs.writeFile(path.join(base, "top.txt"), "top");
  await fs.writeFile(path.join(outside, "out.txt"), "outside");
  closers = [];
});

afterEach(async () => {
  for (const close of closers.reverse()) await close();
  vi.restoreAllMocks();
  await fs.rm(base, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

function rootOf(dir: string): Root {
  return { uri: pathToFileURL(dir).href, name: path.basename(dir) };
}

/**
 * A 2025-era client that supports Roots and answers roots/list with
 * `roots()`, connected to a server for `directories` with confinement on.
 */
async function connect(
  directories: string[],
  roots: () => Root[],
  confineRoots = true,
): Promise<Client> {
  const server = createServer(directories, { confineRoots });
  const client = new Client(
    { name: "fs-confine-test", version: "0.0.0" },
    { capabilities: { roots: { listChanged: true } } },
  );
  client.setRequestHandler("roots/list", async () => ({ roots: roots() }));
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
  return client;
}

describe("confineRootsToDirectories", () => {
  it("keeps a root inside a command-line directory", () => {
    expect(confineRootsToDirectories(["/b/x"], ["/b"])).toEqual({
      confined: ["/b/x"],
      ignored: [],
    });
  });

  it("narrows a root that contains command-line directories to them", () => {
    expect(confineRootsToDirectories(["/"], ["/b", "/c/d"])).toEqual({
      confined: ["/b", "/c/d"],
      ignored: [],
    });
  });

  it("ignores a root that overlaps no command-line directory", () => {
    expect(confineRootsToDirectories(["/elsewhere", "/b"], ["/b"])).toEqual({
      confined: ["/b"],
      ignored: ["/elsewhere"],
    });
  });

  it("does not treat a sibling with a common prefix as inside", () => {
    expect(confineRootsToDirectories(["/base-other"], ["/base"])).toEqual({
      confined: [],
      ignored: ["/base-other"],
    });
  });

  it("lists each directory once", () => {
    expect(confineRootsToDirectories(["/b", "/", "/b"], ["/b"])).toEqual({
      confined: ["/b"],
      ignored: [],
    });
  });
});

describe("with --confine-roots on 2025-11-25", () => {
  it("narrows the allowed directories to a root inside them", async () => {
    const inner = path.join(base, "inner");
    const client = await connect([base], () => [rootOf(inner)]);
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([inner]),
    );
    expect(stderr).toHaveBeenCalledWith(
      describeAllowedDirectories([inner], {
        from: "roots",
        replacedCommandLine: true,
        confined: true,
      }),
    );
    const top = await call(client, "read_text_file", {
      path: path.join(base, "top.txt"),
    });
    expect(textOf(top)).toMatch(/^Access denied/);
  });

  it("ignores a root outside them and keeps the command-line directories", async () => {
    const client = await connect([base], () => [rootOf(outside)]);
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        `Ignored client roots outside the command-line directories (--confine-roots): ${outside}`,
      ),
    );
    expect(await allowedDirectoriesOf(client)).toEqual([base]);
    const out = await call(client, "read_text_file", {
      path: path.join(outside, "out.txt"),
    });
    expect(textOf(out)).toMatch(/^Access denied/);
    const top = await call(client, "read_text_file", {
      path: path.join(base, "top.txt"),
    });
    expect(textOf(top)).toBe("top");
  });

  it("narrows a root that contains a command-line directory to that directory", async () => {
    const client = await connect([base], () => [
      rootOf(path.dirname(base)),
      rootOf(outside),
    ]);
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([base]),
    );
    const out = await call(client, "read_text_file", {
      path: path.join(outside, "out.txt"),
    });
    expect(textOf(out)).toMatch(/^Access denied/);
  });

  it("refuses a symlink inside the directories that points outside them", async () => {
    const link = path.join(base, "link");
    await fs.symlink(outside, link);
    const client = await connect([base], () => [rootOf(link)]);
    await vi.waitFor(() =>
      expect(stderr).toHaveBeenCalledWith(
        `Ignored client roots outside the command-line directories (--confine-roots): ${outside}`,
      ),
    );
    const out = await call(client, "read_text_file", {
      path: path.join(link, "out.txt"),
    });
    expect(textOf(out)).toMatch(/^Access denied/);
  });

  it("revokes access once roots were in force and every new root is outside", async () => {
    const inner = path.join(base, "inner");
    let roots = [rootOf(inner)];
    const client = await connect([base], () => roots);
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([inner]),
    );
    roots = [rootOf(outside)];
    await client.sendRootsListChanged();
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([]),
    );
    const out = await call(client, "read_text_file", {
      path: path.join(outside, "out.txt"),
    });
    expect(textOf(out)).toMatch(/^Access denied/);
  });

  it("lets the roots set the directories when none were given on the command line", async () => {
    const client = await connect([], () => [rootOf(outside)]);
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([outside]),
    );
  });
});

describe("without --confine-roots", () => {
  it("still lets a root outside the command-line directories replace them", async () => {
    const client = await connect([base], () => [rootOf(outside)], false);
    await vi.waitFor(async () =>
      expect(await allowedDirectoriesOf(client)).toEqual([outside]),
    );
  });
});

describe("the command line", () => {
  it("parses --confine-roots anywhere before --", () => {
    expect(parseArgs(["/a", "--confine-roots"])).toEqual({
      directories: ["/a"],
      readOnly: false,
      confineRoots: true,
    });
    expect(parseArgs(["--", "--confine-roots"])).toEqual({
      directories: ["--confine-roots"],
      readOnly: false,
      confineRoots: false,
    });
  });

  it("warns that --confine-roots does nothing without directories", async () => {
    const handle = await main(
      ["--confine-roots"],
      new PassThrough(),
      new PassThrough(),
    );
    closers.push(() => handle.close());
    expect(stderr).toHaveBeenCalledWith(
      "Warning: --confine-roots has no effect without command-line directories; a client's Roots will set the allowed directories",
    );
  });

  it("serves the command-line directories on 2026-07-28, as without the flag", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    stdout.setEncoding("utf8");
    const handle = await main(["--confine-roots", base], stdin, stdout);
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
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": { roots: {} },
          },
          name: "list_allowed_directories",
          arguments: {},
        },
      })}\n`,
    );
    const { result } = JSON.parse(await line) as {
      result: { content: Array<{ text: string }> };
    };
    expect(result.content[0].text).toBe(`Allowed directories:\n${base}`);
  });
});
