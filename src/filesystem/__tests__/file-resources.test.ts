// Files as resources (#297), driven through a real Client over an in-memory
// transport: the file:// template is advertised, resources/list enumerates
// nothing, a read returns text or a base64 blob by type, and a read is
// confined exactly as the tools are (allowed directories only, no symlink out,
// the roots barrier on 2025-11-25, the no-directories error on 2026-07-28).

import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Client,
  InMemoryTransport,
  ProtocolError,
  ResourceNotFoundError,
} from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  createServer,
  NO_ALLOWED_DIRECTORIES_MODERN_ERROR,
} from "../server.js";
import {
  FILE_RESOURCE_TEMPLATE,
  fileResourceContents,
  registerFileResources,
} from "../file-resources.js";
import { connect, makeTempDir, quietStderr } from "./helpers.js";

let allowed: string;
let other: string;
let closers: Array<() => Promise<void>>;

const uriOf = (p: string) => pathToFileURL(p).href;

beforeEach(async () => {
  quietStderr();
  allowed = await makeTempDir("mcp-fs-res-allowed-");
  other = await makeTempDir("mcp-fs-res-other-");
  await fs.writeFile(path.join(other, "secret.txt"), "secret");
  closers = [];
});

afterEach(async () => {
  for (const close of closers.reverse()) await close();
  vi.restoreAllMocks();
  await fs.rm(allowed, { recursive: true, force: true });
  await fs.rm(other, { recursive: true, force: true });
});

async function connectTo(directories: string[]): Promise<Client> {
  const { client, close } = await connect(directories);
  closers.push(close);
  return client;
}

/** The error a resources/read rejects with. */
async function readError(client: Client, uri: string): Promise<ProtocolError> {
  const error = await client.readResource({ uri }).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ProtocolError);
  return error as ProtocolError;
}

describe("resource discovery", () => {
  it("advertises the file:// template and lists no resources", async () => {
    const client = await connectTo([allowed]);
    expect(client.getServerCapabilities()?.resources).toBeDefined();
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates).toEqual([
      expect.objectContaining({
        name: "file",
        uriTemplate: FILE_RESOURCE_TEMPLATE,
      }),
    ]);
    const { resources } = await client.listResources();
    expect(resources).toEqual([]);
  });
});

describe("resources/read", () => {
  it("returns a text file as text", async () => {
    const file = path.join(allowed, "notes.md");
    await fs.writeFile(file, "# héllo\n");
    const client = await connectTo([allowed]);
    const { contents } = await client.readResource({ uri: uriOf(file) });
    expect(contents).toEqual([
      { uri: uriOf(file), mimeType: "text/markdown", text: "# héllo\n" },
    ]);
  });

  it("returns an image as a base64 blob with its MIME type", async () => {
    const file = path.join(allowed, "pixel.png");
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    await fs.writeFile(file, bytes);
    const client = await connectTo([allowed]);
    const { contents } = await client.readResource({ uri: uriOf(file) });
    expect(contents).toEqual([
      {
        uri: uriOf(file),
        mimeType: "image/png",
        blob: bytes.toString("base64"),
      },
    ]);
  });

  it("decodes a percent-encoded path", async () => {
    const file = path.join(allowed, "with space.txt");
    await fs.writeFile(file, "spaced");
    const client = await connectTo([allowed]);
    const uri = uriOf(file);
    expect(uri).toContain("%20");
    const { contents } = await client.readResource({ uri });
    expect(contents[0]).toMatchObject({ text: "spaced" });
  });

  it("rejects a file outside the allowed directories", async () => {
    const client = await connectTo([allowed]);
    const error = await readError(
      client,
      uriOf(path.join(other, "secret.txt")),
    );
    expect(error.code).toBe(-32602);
    expect(error.message).toContain("Access denied");
  });

  it("rejects a dot-dot URI that climbs out of an allowed directory", async () => {
    const client = await connectTo([allowed]);
    const climbing = `${uriOf(allowed)}/../${path.basename(other)}/secret.txt`;
    const error = await readError(client, climbing);
    expect(error.message).toContain("Access denied");
  });

  it("rejects a symlink whose target is outside the allowed directories", async () => {
    const link = path.join(allowed, "link.txt");
    await fs.symlink(path.join(other, "secret.txt"), link);
    const client = await connectTo([allowed]);
    const error = await readError(client, uriOf(link));
    expect(error.message).toContain("symlink target outside");
  });

  it("reports a missing file as resource not found", async () => {
    const client = await connectTo([allowed]);
    const uri = uriOf(path.join(allowed, "missing.txt"));
    const error = await readError(client, uri);
    expect(error).toBeInstanceOf(ResourceNotFoundError);
    expect(error.data).toEqual({ uri });
  });

  it("reports a dangling symlink as resource not found", async () => {
    const link = path.join(allowed, "dangling.txt");
    await fs.symlink(path.join(allowed, "gone", "nowhere.txt"), link);
    const client = await connectTo([allowed]);
    const uri = uriOf(link);
    const error = await readError(client, uri);
    expect(error).toBeInstanceOf(ResourceNotFoundError);
    expect(error.data).toEqual({ uri });
  });

  it("reports a path beneath a regular file as resource not found", async () => {
    await fs.writeFile(path.join(allowed, "parent.txt"), "x");
    const client = await connectTo([allowed]);
    const uri = uriOf(path.join(allowed, "parent.txt", "child.txt"));
    const error = await readError(client, uri);
    expect(error).toBeInstanceOf(ResourceNotFoundError);
    expect(error.data).toEqual({ uri });
  });

  it("reports a directory as not a resource", async () => {
    await fs.mkdir(path.join(allowed, "sub"));
    const client = await connectTo([allowed]);
    const uri = uriOf(path.join(allowed, "sub"));
    const error = await readError(client, uri);
    expect(error).toBeInstanceOf(ResourceNotFoundError);
    expect(error.message).toContain("is a directory");
  });

  it.skipIf(process.platform === "win32")(
    "rejects a file URI with a remote host",
    async () => {
      const client = await connectTo([allowed]);
      const error = await readError(client, "file://elsewhere/etc/passwd");
      expect(error.code).toBe(-32602);
      expect(error.message).toContain("Invalid file URI");
    },
  );

  it("reports any other read failure as an internal error", async () => {
    const file = path.join(allowed, "locked.txt");
    await fs.writeFile(file, "x");
    const client = await connectTo([allowed]);
    vi.spyOn(fs, "readFile").mockRejectedValueOnce(
      Object.assign(new Error("permission denied"), { code: "EACCES" }),
    );
    const error = await readError(client, uriOf(file));
    expect(error.code).toBe(-32603);
    expect(error.message).toContain("permission denied");
  });
});

describe("fileResourceContents", () => {
  const uri = "file:///x";

  it("sniffs an unknown extension: UTF-8 is text/plain", () => {
    expect(
      fileResourceContents(uri, "/a/Makefile", Buffer.from("all:\n")),
    ).toEqual({ uri, mimeType: "text/plain", text: "all:\n" });
  });

  it("sniffs an unknown extension: NUL bytes are an octet-stream blob", () => {
    const bytes = Buffer.from([0x41, 0x00, 0x42]);
    expect(fileResourceContents(uri, "/a/data.bin", bytes)).toEqual({
      uri,
      mimeType: "application/octet-stream",
      blob: bytes.toString("base64"),
    });
  });

  it("returns a textual type that is not valid UTF-8 as a blob of that type", () => {
    const bytes = Buffer.from([0xc3, 0x28]);
    expect(fileResourceContents(uri, "/a/broken.JSON", bytes)).toEqual({
      uri,
      mimeType: "application/json",
      blob: bytes.toString("base64"),
    });
  });
});

describe("protocol eras", () => {
  async function connectEra(
    directories: string[],
    mode: "auto" | "legacy",
    listRoots?: () => Promise<{ uri: string }[]>,
  ): Promise<Client> {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const handle = serveStdio(({ era }) => createServer(directories, { era }), {
      transport: serverTransport,
    });
    const client = new Client(
      { name: "fs-res-era-test", version: "0.0.0" },
      {
        capabilities: listRoots ? { roots: {} } : {},
        versionNegotiation: { mode },
      },
    );
    if (listRoots) {
      client.setRequestHandler("roots/list", async () => ({
        roots: await listRoots(),
      }));
    }
    await client.connect(clientTransport);
    closers.push(
      () => handle.close(),
      () => client.close(),
    );
    return client;
  }

  it("reads a file on 2026-07-28", async () => {
    const file = path.join(allowed, "a.txt");
    await fs.writeFile(file, "modern");
    const client = await connectEra([allowed], "auto");
    expect(client.getProtocolEra()).toBe("modern");
    const { contents } = await client.readResource({ uri: uriOf(file) });
    expect(contents[0]).toMatchObject({ text: "modern" });
  });

  it("explains on 2026-07-28 that a server with no directories cannot operate", async () => {
    const client = await connectEra([], "auto");
    const error = await readError(
      client,
      uriOf(path.join(other, "secret.txt")),
    );
    expect(error.message).toContain(NO_ALLOWED_DIRECTORIES_MODERN_ERROR);
  });

  it("waits on 2025-11-25 for the client's roots before reading", async () => {
    let answer!: (roots: { uri: string }[]) => void;
    const roots = new Promise<{ uri: string }[]>((r) => (answer = r));
    const client = await connectEra([allowed], "legacy", () => roots);
    expect(client.getProtocolEra()).toBe("legacy");
    const read = client.readResource({
      uri: uriOf(path.join(other, "secret.txt")),
    });
    answer([{ uri: uriOf(other) }]);
    const { contents } = await read;
    expect(contents[0]).toMatchObject({ text: "secret" });
  });
});

describe("registerFileResources", () => {
  it("waits again when the roots barrier is replaced while it waits", async () => {
    const file = path.join(allowed, "a.txt");
    await fs.writeFile(file, "after");
    const first = Promise.resolve();
    const second = Promise.resolve();
    const barriers = [first, second, second, second];
    const rootsSettled = vi.fn(() => barriers.shift() ?? second);
    const server = new McpServer({ name: "t", version: "0.0.0" });
    registerFileResources(server, {
      allowedDirectories: () => [allowed],
      rootsSettled,
      unavailableReason: () => undefined,
    });
    const client = new Client({ name: "t", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
    closers.push(
      () => server.close(),
      () => client.close(),
    );
    const { contents } = await client.readResource({ uri: uriOf(file) });
    expect(contents[0]).toMatchObject({ text: "after" });
    // first, then (replaced) second, then second again: settled.
    expect(rootsSettled).toHaveBeenCalledTimes(4);
  });
});
