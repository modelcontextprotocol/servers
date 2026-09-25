import { randomUUID } from "node:crypto";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type {
  EventId,
  EventStore,
  StreamId,
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Simple in-memory event store for SSE resumability.
// Primarily intended for examples and testing, not production use.
export class InMemoryEventStore implements EventStore {
  private events: Map<
    EventId,
    { streamId: StreamId; message: JSONRPCMessage }
  > = new Map();

  async storeEvent(
    streamId: StreamId,
    message: JSONRPCMessage
  ): Promise<EventId> {
    const eventId = randomUUID();
    this.events.set(eventId, { streamId, message });
    return eventId;
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    return this.events.get(eventId)?.streamId;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    {
      send,
    }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
  ): Promise<StreamId> {
    const lastEvent = this.events.get(lastEventId);
    if (!lastEvent) {
      // The SDK type currently requires a StreamId, but unknown event IDs have
      // no stream to resume. Return undefined at runtime to match the intended
      // EventStore semantics and Python API behavior.
      return undefined as unknown as StreamId;
    }

    const { streamId } = lastEvent;
    let foundLastEvent = false;

    for (const [eventId, event] of this.events) {
      if (eventId === lastEventId) {
        foundLastEvent = true;
        continue;
      }

      if (!foundLastEvent || event.streamId !== streamId) {
        continue;
      }

      await send(eventId, event.message);
    }

    return streamId;
  }
}
