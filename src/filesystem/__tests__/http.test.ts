// The Streamable HTTP transport (#576): main() started with
// `--transport streamable-http` on a free loopback port and driven by the SDK
// Client over real HTTP in both protocol eras, plus the pieces it is built
// from: `parseArgs()` reading `--transport`, `httpEndpoint()` reading HOST and
// PORT, and `startHttpServer()`'s own refusals. Over HTTP a client's Roots
// cannot reach the server, so the command-line directories are what both eras
// get, and main() refuses to start without one.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connect as connectTcp } from "node:net";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  endpointUrl,
  httpEndpoint,
  startHttpServer,
  type RunningHttpServer,
} from "../http.js";
import { HTTP_NEEDS_DIRECTORIES_ERROR, main, parseArgs } from "../index.js";
import { createServer } from "../server.js";

const ERAS = [
  ["2026-07-28", { mode: { pin: "2026-07-28" } }, "modern"],
  ["2025-11-25", { mode: "legacy" }, "legacy"],
] as const;

async function connect(
  url: string,
  versionNegotiation: (typeof ERAS)[number][1],
): Promise<Client> {
  const client = new Client(
    { name: "http-test", version: "0.0.0" },
    // A client that offers Roots: over HTTP the server never asks for them.
    { versionNegotiation, capabilities: { roots: { listChanged: true } } },
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

describe("main() over Streamable HTTP", () => {
  const saved = { HOST: process.env.HOST, PORT: process.env.PORT };
  let dir: string;
  let running: RunningHttpServer | undefined;

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dir = await realpath(await mkdtemp(path.join(tmpdir(), "fs-http-")));
    await writeFile(path.join(dir, "hello.txt"), "hello over http");
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";
  });

  afterEach(async () => {
    await running?.close();
    running = undefined;
    await rm(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  /** main() on HTTP with `args`, kept for the afterEach to close. */
  async function start(...args: string[]): Promise<RunningHttpServer> {
    running = (await main([
      "--transport",
      "streamable-http",
      ...args,
    ])) as RunningHttpServer;
    return running;
  }

  it.each(ERAS)(
    "serves a %s client within the command-line directories",
    async (_, negotiation, era) => {
      const client = await connect((await start(dir)).url, negotiation);
      try {
        expect(client.getProtocolEra()).toBe(era);
        const result = await client.callTool({
          name: "read_text_file",
          arguments: { path: path.join(dir, "hello.txt") },
        });
        expect(result.isError).toBeFalsy();
        expect(JSON.stringify(result.content)).toContain("hello over http");
        const outside = await client.callTool({
          name: "read_text_file",
          arguments: { path: path.join(tmpdir(), "elsewhere.txt") },
        });
        expect(outside.isError).toBe(true);
      } finally {
        await client.close();
      }
    },
  );

  it("announces the URL, the options and the directories on stderr", async () => {
    const url = (await start("--read-only", dir)).url;
    expect(console.error).toHaveBeenCalledWith(
      `Secure MCP Filesystem Server running on Streamable HTTP at ${url}`,
    );
    expect(console.error).toHaveBeenCalledWith(
      "Read-only mode: only tools that cannot change the filesystem are served",
    );
  });

  it("refuses to start without a usable directory", async () => {
    await expect(main(["--transport=streamable-http"])).rejects.toThrow(
      HTTP_NEEDS_DIRECTORIES_ERROR,
    );
  });
});

describe("startHttpServer", () => {
  let running: RunningHttpServer | undefined;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    await running?.close();
    running = undefined;
    vi.restoreAllMocks();
  });

  async function start(): Promise<RunningHttpServer> {
    running = await startHttpServer(() => createServer([tmpdir()]), {
      host: "127.0.0.1",
      port: 0,
    });
    return running;
  }

  it("answers a malformed request target 404 and keeps serving", async () => {
    const url = new URL((await start()).url);
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = connectTcp(Number(url.port), url.hostname, () =>
        socket.write("GET //[ HTTP/1.1\r\nHost: localhost\r\n\r\n"),
      );
      socket.setEncoding("utf8");
      socket.once("data", (chunk: string) => {
        socket.destroy();
        resolve(chunk);
      });
      socket.once("error", reject);
    });
    expect(reply).toMatch(/^HTTP\/1\.1 404/);
    expect((await fetch(new URL("/other", url))).status).toBe(404);
  });

  it("answers 404 off the MCP path and 403 to a foreign Origin", async () => {
    const base = new URL((await start()).url);
    expect((await fetch(new URL("/other", base))).status).toBe(404);
    const foreign = await fetch(base, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(foreign.status).toBe(403);
  });

  it("reports a request the SDK refuses through onerror", async () => {
    // A 2026-07-28 header on a request with no 2026-07-28 envelope.
    const response = await fetch((await start()).url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    expect(response.status).toBe(400);
    expect(console.error).toHaveBeenCalledWith(
      "Error serving MCP request:",
      expect.any(Error),
    );
  });

  it("rejects when the port is already bound", async () => {
    const port = Number(new URL((await start()).url).port);
    await expect(
      startHttpServer(() => createServer([tmpdir()]), {
        host: "127.0.0.1",
        port,
      }),
    ).rejects.toThrow(/EADDRINUSE/);
  });
});

describe("endpointUrl", () => {
  it("brackets an IPv6 literal", () => {
    expect(endpointUrl("127.0.0.1", 3001)).toBe("http://127.0.0.1:3001/mcp");
    expect(endpointUrl("::1", 3001)).toBe("http://[::1]:3001/mcp");
  });
});

describe("httpEndpoint", () => {
  it("defaults to loopback on the default port", () => {
    expect(httpEndpoint({})).toEqual({
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
    });
  });

  it("reads HOST and PORT", () => {
    expect(httpEndpoint({ HOST: "0.0.0.0", PORT: "8080" })).toEqual({
      host: "0.0.0.0",
      port: 8080,
    });
  });

  it.each(["abc", "-1", "65536", "1.5"])("refuses PORT=%s", (PORT) => {
    expect(() => httpEndpoint({ PORT })).toThrow(/Invalid PORT/);
  });
});

describe("parseArgs with --transport", () => {
  it.each([
    [["/a"], "stdio"],
    [["--transport", "stdio", "/a"], "stdio"],
    [["/a", "--transport", "streamable-http"], "streamable-http"],
    [["--transport=streamable-http", "/a"], "streamable-http"],
  ] as const)("reads %j as %s", (args, transport) => {
    expect(parseArgs([...args])).toMatchObject({
      directories: ["/a"],
      transport,
    });
  });

  it("takes --transport after -- as a directory", () => {
    expect(parseArgs(["--", "--transport"])).toMatchObject({
      directories: ["--transport"],
      transport: "stdio",
    });
  });

  it("throws on a missing or unknown transport", () => {
    expect(() => parseArgs(["--transport"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--transport", "sse"])).toThrow(
      /Unknown transport "sse"/,
    );
  });
});
