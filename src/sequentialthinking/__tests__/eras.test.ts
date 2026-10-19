// The server on both protocol eras (#4852). `main()` serves through the SDK's
// `serveStdio` entry, so the first message a client sends picks the
// connection's era: a 2026-07-28 client opens with `server/discover` and puts
// its protocol version, identity and capabilities in each request's `_meta`;
// a 2025-11-25 client opens with the `initialize` handshake. Both are driven
// here over an in-memory transport handed to `main()`, first through the SDK
// Client (what an application sees), then as raw JSON-RPC, because the client
// consumes the 2026-07-28 wire fields (`resultType`, `ttlMs`, `cacheScope`,
// the `serverInfo` stamp) before a caller can read them.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Client,
  InMemoryTransport,
  type JSONRPCMessage,
} from "@modelcontextprotocol/client";
import { main } from "../index.js";
import { TOOL_NAME, parseOk, thought, type WireResult } from "./helpers.js";

const MODERN = "2026-07-28";

/** The per-request `_meta` envelope a 2026-07-28 request carries. */
function envelope(protocolVersion: string = MODERN): Record<string, unknown> {
  return {
    "io.modelcontextprotocol/protocolVersion": protocolVersion,
    "io.modelcontextprotocol/clientInfo": { name: "raw", version: "0.0.0" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
}

/** A raw JSON-RPC peer of a server served by `main()`. */
async function rawPeer() {
  const [peer, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = main(serverTransport);
  const waiting = new Map<number, (message: JSONRPCMessage) => void>();
  peer.onmessage = (message) => {
    if ("id" in message && typeof message.id === "number") {
      waiting.get(message.id)?.(message);
    }
  };
  await peer.start();
  let nextId = 1;
  return {
    /** Send one request and resolve with the server's response to it. */
    request(method: string, params: Record<string, unknown> = {}) {
      const id = nextId++;
      return new Promise<Record<string, unknown>>((resolve) => {
        waiting.set(id, (m) => resolve(m as Record<string, unknown>));
        void peer.send({ jsonrpc: "2.0", id, method, params });
      });
    },
    close: () => handle.close(),
  };
}

describe("both protocol eras", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.DISABLE_THOUGHT_LOGGING = "true";
  });

  afterEach(() => {
    delete process.env.DISABLE_THOUGHT_LOGGING;
    vi.restoreAllMocks();
  });

  it.each([
    ["a 2026-07-28 client", "auto", "modern"],
    ["a 2025-11-25 client", "legacy", "legacy"],
  ] as const)("serves %s from the same factory", async (_, mode, era) => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const handle = main(serverTransport);
    const client = new Client(
      { name: "era-test", version: "0.0.0" },
      { versionNegotiation: { mode } },
    );
    try {
      await client.connect(clientTransport);
      expect(client.getProtocolEra()).toBe(era);
      expect(client.getServerVersion()?.name).toBe(
        "sequential-thinking-server",
      );
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual([TOOL_NAME]);
      const result = (await client.callTool({
        name: TOOL_NAME,
        arguments: thought(),
      })) as WireResult;
      expect(parseOk(result).thoughtHistoryLength).toBe(1);
    } finally {
      await client.close();
      await handle.close();
    }
  });

  it("keeps one thought history per connection", async () => {
    const connections = await Promise.all(
      [0, 1].map(async () => {
        const [clientTransport, serverTransport] =
          InMemoryTransport.createLinkedPair();
        const handle = main(serverTransport);
        const client = new Client(
          { name: "era-test", version: "0.0.0" },
          { versionNegotiation: { mode: "auto" } },
        );
        await client.connect(clientTransport);
        return { client, handle };
      }),
    );
    try {
      const [a, b] = connections;
      await a.client.callTool({ name: TOOL_NAME, arguments: thought() });
      await a.client.callTool({
        name: TOOL_NAME,
        arguments: thought({ thoughtNumber: 2 }),
      });
      const fromB = (await b.client.callTool({
        name: TOOL_NAME,
        arguments: thought(),
      })) as WireResult;
      expect(parseOk(fromB).thoughtHistoryLength).toBe(1);
    } finally {
      for (const { client, handle } of connections) {
        await client.close();
        await handle.close();
      }
    }
  });

  describe("on the 2026-07-28 wire", () => {
    it("answers server/discover with the version, capabilities and identity", async () => {
      const peer = await rawPeer();
      try {
        const response = await peer.request("server/discover", {
          _meta: envelope(),
        });
        const result = response.result as Record<string, unknown>;
        expect(result.supportedVersions).toContain(MODERN);
        expect(result.capabilities).toMatchObject({ tools: {} });
        expect(result.resultType).toBe("complete");
        expect(result._meta).toMatchObject({
          "io.modelcontextprotocol/serverInfo": {
            name: "sequential-thinking-server",
          },
        });
      } finally {
        await peer.close();
      }
    });

    it("needs no initialize, and stamps resultType and the cache fields", async () => {
      const peer = await rawPeer();
      try {
        const list = (await peer.request("tools/list", { _meta: envelope() }))
          .result as Record<string, unknown>;
        expect(list).toMatchObject({
          resultType: "complete",
          ttlMs: 0,
          cacheScope: "private",
        });
        const call = (
          await peer.request("tools/call", {
            _meta: envelope(),
            name: TOOL_NAME,
            arguments: thought(),
          })
        ).result as Record<string, unknown>;
        expect(call.resultType).toBe("complete");
        expect(call.structuredContent).toMatchObject({ thoughtNumber: 1 });
      } finally {
        await peer.close();
      }
    });

    it("refuses a protocol version it does not serve with -32022", async () => {
      const peer = await rawPeer();
      try {
        const response = await peer.request("server/discover", {
          _meta: envelope("2099-01-01"),
        });
        expect(response.error).toMatchObject({
          code: -32022,
          data: { requested: "2099-01-01" },
        });
        const error = response.error as { data: { supported: string[] } };
        expect(error.data.supported).toContain(MODERN);
      } finally {
        await peer.close();
      }
    });
  });
});
