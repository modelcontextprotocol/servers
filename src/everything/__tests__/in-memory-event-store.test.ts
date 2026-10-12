// Unit tests for the Streamable HTTP event store (#4087), called directly
// rather than over HTTP: which events a replay sends, and what an unknown event
// id yields, are exact here, where streamable-http.test.ts can only observe
// them through the SDK (which asks getStreamIdForEventId first and refuses an
// unknown id before replaying).

import { describe, it, expect } from "vitest";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryEventStore } from "../transports/in-memory-event-store.js";

const message = (method: string): JSONRPCMessage => ({
  jsonrpc: "2.0",
  method,
});

describe("InMemoryEventStore", () => {
  it("replays only events from the same stream after the requested event", async () => {
    const eventStore = new InMemoryEventStore();
    const firstStreamEvent = await eventStore.storeEvent(
      "stream-a",
      message("notifications/stream-a/first"),
    );
    const otherStreamEvent = await eventStore.storeEvent(
      "stream-b",
      message("notifications/stream-b/first"),
    );
    const secondStreamEvent = await eventStore.storeEvent(
      "stream-a",
      message("notifications/stream-a/second"),
    );
    await eventStore.storeEvent(
      "stream-b",
      message("notifications/stream-b/second"),
    );

    const replayedEvents: Array<{ eventId: string; message: JSONRPCMessage }> =
      [];
    const replayedStreamId = await eventStore.replayEventsAfter(
      firstStreamEvent,
      {
        send: async (eventId, replayedMessage) => {
          replayedEvents.push({ eventId, message: replayedMessage });
        },
      },
    );

    expect(replayedStreamId).toBe("stream-a");
    expect(replayedEvents).toEqual([
      {
        eventId: secondStreamEvent,
        message: message("notifications/stream-a/second"),
      },
    ]);
    expect(replayedEvents.map(({ eventId }) => eventId)).not.toContain(
      otherStreamEvent,
    );
  });

  it("rejects an unknown event id without replaying anything", async () => {
    const eventStore = new InMemoryEventStore();
    await eventStore.storeEvent("stream-a", message("notifications/stream-a"));

    const replayedEvents: Array<{ eventId: string; message: JSONRPCMessage }> =
      [];
    await expect(
      eventStore.replayEventsAfter("unknown-event-id", {
        send: async (eventId, replayedMessage) => {
          replayedEvents.push({ eventId, message: replayedMessage });
        },
      }),
    ).rejects.toThrow("Unknown event ID: unknown-event-id");
    expect(replayedEvents).toEqual([]);
  });

  it("looks up the stream id for a stored event id", async () => {
    const eventStore = new InMemoryEventStore();
    const eventId = await eventStore.storeEvent(
      "stream-a",
      message("notifications/stream-a"),
    );

    await expect(eventStore.getStreamIdForEventId(eventId)).resolves.toBe(
      "stream-a",
    );
    await expect(
      eventStore.getStreamIdForEventId("unknown-event-id"),
    ).resolves.toBeUndefined();
  });
});
