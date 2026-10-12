/**
 * The few paths of the server factory and its helpers that no protocol
 * session reaches (#4854): `cleanup()` for a server no client ever
 * initialized, and a `text` session resource (the only tool that creates
 * session resources, gzip-file-as-resource, makes blobs), and `syncRoots()`
 * for a server with no initialized client.
 */
import { describe, expect, it, vi } from "vitest";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { createServer } from "../server/index.js";
import { registerSessionResource } from "../resources/session.js";
import { syncRoots } from "../server/roots.js";

describe("createServer", () => {
  it("cleans up a server that no client has initialized", () => {
    const { cleanup } = createServer();
    expect(() => cleanup()).not.toThrow();
  });
});

describe("registerSessionResource", () => {
  it("registers a text resource and returns a link to it", async () => {
    const server = new McpServer({ name: "s", version: "0" });
    const link = registerSessionResource(
      server,
      {
        uri: "demo://resource/session/note.txt",
        name: "note.txt",
        mimeType: "text/plain",
      },
      "text",
      "a note",
    );
    expect(link).toEqual({
      type: "resource_link",
      uri: "demo://resource/session/note.txt",
      name: "note.txt",
      mimeType: "text/plain",
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "c", version: "0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const { contents } = await client.readResource({ uri: link.uri });
    expect(contents).toEqual([
      {
        uri: "demo://resource/session/note.txt",
        mimeType: "text/plain",
        text: "a note",
      },
    ]);
    await client.close();
  });
});

describe("syncRoots", () => {
  it("does nothing for a server whose client has not initialized", async () => {
    const server = new McpServer({ name: "s", version: "0" });
    expect(await syncRoots(server)).toBeUndefined();
  });
});

describe("syncRoots, called again", () => {
  it("asks again but installs its roots/list_changed handler once", async () => {
    const server = new McpServer({ name: "s", version: "0" });
    let requests = 0;
    const client = new Client(
      { name: "c", version: "0" },
      { capabilities: { roots: { listChanged: true } } },
    );
    client.setRequestHandler("roots/list", async () => {
      requests++;
      return { roots: [] };
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    await syncRoots(server);
    await syncRoots(server);
    expect(requests).toBe(2);
    // One handler, so one more request per change, not two.
    await client.sendRootsListChanged();
    await vi.waitFor(() => expect(requests).toBe(3));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toBe(3);
    await client.close();
  });
});
