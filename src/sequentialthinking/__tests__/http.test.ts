// The Streamable HTTP transport (#576): `http.ts` bound on a free loopback
// port and driven by the SDK Client over real HTTP in both protocol eras, plus
// `run()`'s transport selection and `httpEndpoint()`'s reading of HOST and
// PORT. Over HTTP every request gets a fresh server, so the shared thought
// history is asserted across calls and across clients.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connect as connectTcp } from "node:net";
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
import { parseTransport, run } from "../index.js";
import { TOOL_NAME, parseOk, thought, type WireResult } from "./helpers.js";

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
    { versionNegotiation },
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

describe("Streamable HTTP", () => {
  let running: RunningHttpServer | undefined;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.DISABLE_THOUGHT_LOGGING = "true";
  });

  afterEach(async () => {
    await running?.close();
    running = undefined;
    delete process.env.DISABLE_THOUGHT_LOGGING;
    vi.restoreAllMocks();
  });

  it.each(ERAS)(
    "serves a %s client and keeps one history across its requests",
    async (_, negotiation, era) => {
      running = await startHttpServer({ host: "127.0.0.1", port: 0 });
      const client = await connect(running.url, negotiation);
      try {
        expect(client.getProtocolEra()).toBe(era);
        const { tools } = await client.listTools();
        expect(tools.map((t) => t.name)).toEqual([TOOL_NAME]);
        for (const n of [1, 2]) {
          const result = (await client.callTool({
            name: TOOL_NAME,
            arguments: thought({ thoughtNumber: n }),
          })) as WireResult;
          expect(parseOk(result).thoughtHistoryLength).toBe(n);
        }
      } finally {
        await client.close();
      }
    },
  );

  it("shares the history between clients of the same process", async () => {
    running = await startHttpServer({ host: "127.0.0.1", port: 0 });
    const first = await connect(running.url, ERAS[0][1]);
    const second = await connect(running.url, ERAS[1][1]);
    try {
      await first.callTool({ name: TOOL_NAME, arguments: thought() });
      const result = (await second.callTool({
        name: TOOL_NAME,
        arguments: thought(),
      })) as WireResult;
      expect(parseOk(result).thoughtHistoryLength).toBe(2);
    } finally {
      await first.close();
      await second.close();
    }
  });

  it("answers a malformed request target 404 and keeps serving", async () => {
    running = await startHttpServer({ host: "127.0.0.1", port: 0 });
    const url = new URL(running.url);
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
    running = await startHttpServer({ host: "127.0.0.1", port: 0 });
    const base = new URL(running.url);
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
    running = await startHttpServer({ host: "127.0.0.1", port: 0 });
    // A 2026-07-28 header on a request with no 2026-07-28 envelope.
    const response = await fetch(running.url, {
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
    running = await startHttpServer({ host: "127.0.0.1", port: 0 });
    const port = Number(new URL(running.url).port);
    await expect(startHttpServer({ host: "127.0.0.1", port })).rejects.toThrow(
      /EADDRINUSE/,
    );
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

describe("parseTransport", () => {
  it.each([
    [[], "stdio"],
    [["--transport", "stdio"], "stdio"],
    [["--transport", "streamable-http"], "streamable-http"],
    [["--transport=streamable-http"], "streamable-http"],
  ] as const)("reads %j as %s", (args, expected) => {
    expect(parseTransport([...args])).toBe(expected);
  });

  it("throws on a missing or unknown transport", () => {
    expect(() => parseTransport(["--transport"])).toThrow(/needs a value/);
    expect(() => parseTransport(["--transport", "sse"])).toThrow(
      /Unknown transport "sse"/,
    );
  });
});

describe("run", () => {
  const saved = { HOST: process.env.HOST, PORT: process.env.PORT };
  const signals = ["SIGINT", "SIGTERM"] as const;
  let before: Record<(typeof signals)[number], unknown[]>;

  /** The signal listeners `run()` added since the test began. */
  function added(signal: (typeof signals)[number]) {
    return process
      .listeners(signal)
      .filter((listener) => !before[signal].includes(listener));
  }

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    before = {
      SIGINT: process.listeners("SIGINT"),
      SIGTERM: process.listeners("SIGTERM"),
    };
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";
  });

  afterEach(() => {
    for (const signal of signals) {
      for (const listener of added(signal)) process.off(signal, listener);
    }
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it("starts Streamable HTTP on HOST:PORT and stops it on SIGINT", async () => {
    await run(["--transport", "streamable-http"]);
    expect(added("SIGINT")).toHaveLength(1);
    expect(added("SIGTERM")).toHaveLength(1);
    const announced = vi
      .mocked(console.error)
      .mock.calls.flat()
      .map(String)
      .find((line) => line.includes("running on Streamable HTTP"));
    const url = announced!.match(/http:\/\/\S+/)![0];
    // A 2025-era session operation, which the stateless endpoint refuses.
    expect((await fetch(url)).status).toBe(405);

    added("SIGINT")[0]("SIGINT");
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(0));
    await expect(fetch(url)).rejects.toThrow();
  });

  it("reports a shutdown that fails and exits non-zero", async () => {
    const running = await run(["--transport=streamable-http"]);
    const close = running.close;
    const failure = new Error("stuck");
    running.close = vi.fn().mockRejectedValue(failure);
    added("SIGTERM")[0]("SIGTERM");
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(1));
    expect(console.error).toHaveBeenCalledWith("Error shutting down:", failure);
    await close();
  });
});
