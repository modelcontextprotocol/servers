// Characterization tests for the memory server's knowledge-graph resource,
// driven through an SDK Client over an in-memory transport (#4854): listing
// and reading it, subscribing to it, and the notifications/resources/updated
// that mutation tools send (notifyGraphUpdated). They replace the earlier
// tests that called the register functions with a mocked McpServer.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { call, connect, makeTempGraph } from "./helpers.js";
import type { Connection } from "./helpers.js";

const URI = "memory://knowledge-graph";

const alice = { name: "Alice", entityType: "person", observations: ["a"] };
const bob = { name: "Bob", entityType: "person", observations: ["b"] };
const aliceKnowsBob = { from: "Alice", to: "Bob", relationType: "knows" };

describe("knowledge-graph resource over the protocol", () => {
  let conn: Connection;
  let client: Client;
  let filePath: string;
  let cleanup: () => Promise<void>;
  let updates: { uri: string }[];

  beforeEach(async () => {
    const graph = await makeTempGraph();
    filePath = graph.filePath;
    cleanup = graph.cleanup;
    conn = await connect(filePath);
    client = conn.client;
    updates = [];
    client.setNotificationHandler(
      ResourceUpdatedNotificationSchema,
      (notification) => {
        updates.push(notification.params);
      },
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await conn.close();
    await cleanup();
  });

  // A round trip after the call under test, so any notification it sent has
  // been delivered before the test looks at `updates`.
  async function settle() {
    await client.ping();
  }

  describe("listing and reading", () => {
    it("lists the knowledge-graph resource and no templates", async () => {
      expect(await client.listResources()).toEqual({
        resources: [
          {
            name: "knowledge-graph",
            title: "Knowledge Graph",
            uri: URI,
            description:
              "The full knowledge graph with all entities and relations",
            mimeType: "application/json",
          },
        ],
      });
      expect(await client.listResourceTemplates()).toEqual({
        resourceTemplates: [],
      });
    });

    it("reads an empty graph before anything is written", async () => {
      expect(await client.readResource({ uri: URI })).toEqual({
        contents: [
          {
            uri: URI,
            mimeType: "application/json",
            text: JSON.stringify({ entities: [], relations: [] }, null, 2),
          },
        ],
      });
    });

    it("reads the current graph as pretty-printed JSON", async () => {
      await call(client, "create_entities", { entities: [alice, bob] });
      await call(client, "create_relations", { relations: [aliceKnowsBob] });

      const { contents } = await client.readResource({ uri: URI });
      expect(contents).toEqual([
        {
          uri: URI,
          mimeType: "application/json",
          text: JSON.stringify(
            { entities: [alice, bob], relations: [aliceKnowsBob] },
            null,
            2,
          ),
        },
      ]);
    });

    it("rejects a URI it does not serve", async () => {
      await expect(
        client.readResource({ uri: "memory://other" }),
      ).rejects.toThrow("Resource memory://other not found");
    });
  });

  describe("subscriptions", () => {
    it("acknowledges subscribe and unsubscribe with an empty result", async () => {
      expect(await client.subscribeResource({ uri: URI })).toEqual({});
      expect(await client.unsubscribeResource({ uri: URI })).toEqual({});
    });

    it("sends no update to a client that has not subscribed", async () => {
      await call(client, "create_entities", { entities: [alice] });
      await settle();
      expect(updates).toEqual([]);
    });

    it("sends one update per successful mutation tool call", async () => {
      await client.subscribeResource({ uri: URI });

      await call(client, "create_entities", { entities: [alice, bob] });
      await call(client, "create_relations", { relations: [aliceKnowsBob] });
      await call(client, "add_observations", {
        observations: [{ entityName: "Alice", contents: ["c"] }],
      });
      await call(client, "delete_observations", {
        deletions: [{ entityName: "Alice", observations: ["c"] }],
      });
      await call(client, "delete_relations", { relations: [aliceKnowsBob] });
      await call(client, "delete_entities", { entityNames: ["Bob"] });
      await settle();

      expect(updates).toEqual(Array.from({ length: 6 }, () => ({ uri: URI })));
    });

    it("notifies even when a mutation changed nothing", async () => {
      await client.subscribeResource({ uri: URI });
      await call(client, "delete_entities", { entityNames: ["Nobody"] });
      await settle();
      expect(updates).toEqual([{ uri: URI }]);
    });

    it("does not notify for read-only tools or a failed mutation", async () => {
      await call(client, "create_entities", { entities: [alice] });
      await client.subscribeResource({ uri: URI });

      await call(client, "read_graph");
      await call(client, "search_nodes", { query: "Alice" });
      await call(client, "open_nodes", { names: ["Alice"] });
      await client.readResource({ uri: URI });
      const failed = await call(client, "create_relations", {
        relations: [{ from: "Alice", to: "Zed", relationType: "x" }],
      });
      await settle();

      expect(failed.isError).toBe(true);
      expect(updates).toEqual([]);
    });

    it("does not notify a client subscribed only to another URI", async () => {
      await client.subscribeResource({ uri: "memory://something-else" });
      await call(client, "create_entities", { entities: [alice] });
      await settle();
      expect(updates).toEqual([]);
    });

    it("stops notifying after unsubscribe", async () => {
      await client.subscribeResource({ uri: URI });
      await call(client, "create_entities", { entities: [alice] });
      await client.unsubscribeResource({ uri: URI });
      await call(client, "create_entities", { entities: [bob] });
      await settle();
      expect(updates).toEqual([{ uri: URI }]);
    });

    it("keeps each server's subscribers to itself", async () => {
      const other = await connect(filePath);
      try {
        await other.client.subscribeResource({ uri: URI });
        await call(client, "create_entities", { entities: [alice] });
        await settle();
        expect(updates).toEqual([]);
      } finally {
        await other.close();
      }
    });

    it("logs a failed notification and still returns the tool result", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const transport = conn.serverTransport;
      const send = transport.send.bind(transport);
      transport.send = async (message: JSONRPCMessage) => {
        if (
          "method" in message &&
          message.method === "notifications/resources/updated"
        ) {
          throw new Error("delivery failed");
        }
        return send(message);
      };
      await client.subscribeResource({ uri: URI });

      const result = await call(client, "create_entities", {
        entities: [alice],
      });
      await settle();

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({ entities: [alice] });
      expect(updates).toEqual([]);
      // The failure is logged from a detached .catch, so wait for it.
      await vi.waitFor(() =>
        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to send resource updated notification:",
          expect.objectContaining({ message: "delivery failed" }),
        ),
      );
    });
  });
});
