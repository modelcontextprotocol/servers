// The memory server on both protocol eras (#4852). main() serves through the
// SDK's serveStdio entry, so the first message a client sends picks the
// connection's era: a 2026-07-28 client opens with server/discover and asks
// for knowledge-graph updates in its subscriptions/listen filter; a
// 2025-11-25 client opens with initialize and asks with resources/subscribe.
// Both are driven over an in-memory transport handed to main(), through the
// SDK Client, and the 2026-07-28 wire fields the client consumes (resultType,
// the cache fields) are read from the raw exchange.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Client,
  InMemoryTransport,
  ProtocolError,
  type JSONRPCMessage,
} from "@modelcontextprotocol/client";
import { main } from "../index.js";
import { call, makeTempGraph } from "./helpers.js";

const URI = "memory://knowledge-graph";
const alice = { name: "Alice", entityType: "person", observations: [] };

describe("both protocol eras", () => {
  let originalEnv: string | undefined;
  let cleanup: () => Promise<void>;
  let closers: Array<() => Promise<void>>;

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    originalEnv = process.env.MEMORY_FILE_PATH;
    const graph = await makeTempGraph();
    process.env.MEMORY_FILE_PATH = graph.filePath;
    cleanup = graph.cleanup;
    closers = [];
  });

  afterEach(async () => {
    for (const close of closers.reverse()) await close();
    if (originalEnv === undefined) {
      delete process.env.MEMORY_FILE_PATH;
    } else {
      process.env.MEMORY_FILE_PATH = originalEnv;
    }
    vi.restoreAllMocks();
    await cleanup();
  });

  /** A client of a server started by main(), negotiating per `mode`. */
  async function connect(mode: "auto" | "legacy"): Promise<Client> {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const handle = await main(serverTransport);
    const client = new Client(
      { name: "memory-era-test", version: "0.0.0" },
      { versionNegotiation: { mode } },
    );
    await client.connect(clientTransport);
    closers.push(
      () => handle.close(),
      () => client.close(),
    );
    return client;
  }

  /** Resolves with the URI of the next notifications/resources/updated. */
  function nextUpdate(client: Client): Promise<string> {
    return new Promise((resolve) => {
      client.setNotificationHandler(
        "notifications/resources/updated",
        (notification) => resolve(notification.params.uri),
      );
    });
  }

  it("sends a 2026-07-28 client graph updates on its listen stream", async () => {
    const client = await connect("auto");
    expect(client.getProtocolEra()).toBe("modern");
    const subscription = await client.listen({
      resourceSubscriptions: [URI],
    });
    expect(subscription.honoredFilter.resourceSubscriptions).toEqual([URI]);
    const updated = nextUpdate(client);
    await call(client, "create_entities", { entities: [alice] });
    expect(await updated).toBe(URI);
    await subscription.close();
  });

  it("sends a 2026-07-28 client no update it did not listen for", async () => {
    const client = await connect("auto");
    const updates: string[] = [];
    client.setNotificationHandler(
      "notifications/resources/updated",
      (notification) => {
        updates.push(notification.params.uri);
      },
    );
    const subscription = await client.listen({ toolsListChanged: true });
    await call(client, "create_entities", { entities: [alice] });
    // A read after the write: any notification it sent is delivered first.
    await client.readResource({ uri: URI });
    expect(updates).toEqual([]);
    await subscription.close();
  });

  it("sends a 2025-11-25 client graph updates once it subscribes", async () => {
    const client = await connect("legacy");
    expect(client.getProtocolEra()).toBe("legacy");
    await client.subscribeResource({ uri: URI });
    const updated = nextUpdate(client);
    await call(client, "create_entities", { entities: [alice] });
    expect(await updated).toBe(URI);
  });

  it.each(["auto", "legacy"] as const)(
    "reads the graph back to a %s client",
    async (mode) => {
      const client = await connect(mode);
      await call(client, "create_entities", { entities: [alice] });
      const { contents } = await client.readResource({ uri: URI });
      expect(JSON.parse((contents[0] as { text: string }).text)).toMatchObject({
        entities: [{ name: "Alice" }],
      });
    },
  );

  it("answers a read of an unknown resource with -32602 on 2026-07-28", async () => {
    const client = await connect("auto");
    const read = client.readResource({ uri: "memory://nothing-here" });
    await expect(read).rejects.toBeInstanceOf(ProtocolError);
    await expect(read).rejects.toMatchObject({ code: -32602 });
  });

  it("reports a transport that cannot start on stderr and in the exit status", async () => {
    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    const failure = new Error("no pipe");
    vi.spyOn(serverTransport, "start").mockRejectedValue(failure);
    const handle = await main(serverTransport);
    await handle.close();
    expect(console.error).toHaveBeenCalledWith("Transport error:", failure);
    // Reset it so the run is not failed.
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it("answers resources/subscribe from a 2026-07-28 peer with -32601", async () => {
    // The revision removed the method, so the SDK refuses it before any
    // handler runs, though the factory installs one for 2025-era clients.
    const [peer, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = await main(serverTransport);
    closers.push(() => handle.close());
    const response = new Promise<JSONRPCMessage>((resolve) => {
      peer.onmessage = resolve;
    });
    await peer.start();
    await peer.send({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/subscribe",
      params: {
        uri: URI,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    });
    expect((await response) as Record<string, unknown>).toMatchObject({
      error: { code: -32601 },
    });
  });

  it("stamps resultType and the cache fields on a 2026-07-28 read", async () => {
    const [peer, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = await main(serverTransport);
    closers.push(() => handle.close());
    const response = new Promise<JSONRPCMessage>((resolve) => {
      peer.onmessage = resolve;
    });
    await peer.start();
    await peer.send({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: {
        uri: URI,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    });
    expect((await response) as Record<string, unknown>).toMatchObject({
      result: { resultType: "complete", ttlMs: 0, cacheScope: "private" },
    });
  });
});
