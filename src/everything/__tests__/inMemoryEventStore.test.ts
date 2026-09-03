import { describe, it, expect } from "vitest";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryEventStore } from "../transports/inMemoryEventStore.js";

const message = (method: string): JSONRPCMessage => ({
  jsonrpc: "2.0",
  method,
});

describe("InMemoryEventStore", () => {
  it("replays only events from the same stream after the requested event", async () => {
    const eventStore = new InMemoryEventStore();
    const firstStreamEvent = await eventStore.storeEvent(
      "stream-a",
      message("notifications/stream-a/first")
    );
    const otherStreamEvent = await eventStore.storeEvent(
      "stream-b",
      message("notifications/stream-b/first")
    );
    const secondStreamEvent = await eventStore.storeEvent(
      "stream-a",
      message("notifications/stream-a/second")
    );
    await eventStore.storeEvent(
      "stream-b",
      message("notifications/stream-b/second")
    );

    const replayedEvents: Array<{ eventId: string; message: JSONRPCMessage }> =
      [];
    const replayedStreamId = await eventStore.replayEventsAfter(
      firstStreamEvent,
      {
        send: async (eventId, replayedMessage) => {
          replayedEvents.push({ eventId, message: replayedMessage });
        },
      }
    );

    expect(replayedStreamId).toBe("stream-a");
    expect(replayedEvents).toEqual([
      {
        eventId: secondStreamEvent,
        message: message("notifications/stream-a/second"),
      },
    ]);
    expect(replayedEvents.map(({ eventId }) => eventId)).not.toContain(
      otherStreamEvent
    );
  });

  it("returns undefined without replaying events for unknown event ids", async () => {
    const eventStore = new InMemoryEventStore();
    await eventStore.storeEvent("stream-a", message("notifications/stream-a"));

    const replayedEvents: Array<{ eventId: string; message: JSONRPCMessage }> =
      [];
    const replayedStreamId = await eventStore.replayEventsAfter(
      "unknown-event-id",
      {
        send: async (eventId, replayedMessage) => {
          replayedEvents.push({ eventId, message: replayedMessage });
        },
      }
    );

    expect(replayedStreamId).toBeUndefined();
    expect(replayedEvents).toEqual([]);
  });

  it("looks up the stream id for a stored event id", async () => {
    const eventStore = new InMemoryEventStore();
    const eventId = await eventStore.storeEvent(
      "stream-a",
      message("notifications/stream-a")
    );

    await expect(eventStore.getStreamIdForEventId(eventId)).resolves.toBe(
      "stream-a"
    );
    await expect(
      eventStore.getStreamIdForEventId("unknown-event-id")
    ).resolves.toBeUndefined();
  });
});
