// The Streamable HTTP transport's event store, which makes its SSE streams
// resumable: a client that reconnects with a `Last-Event-ID` is sent the
// events it missed (#4087).
//
// Events are kept per stream, and a replay sends only the later events of the
// stream the given event belongs to, never another stream's. An unknown event
// id has no stream: `getStreamIdForEventId` reports that as `undefined`, which
// is how the SDK learns to refuse the resume before it calls
// `replayEventsAfter`. In memory and unbounded, so for examples and testing,
// not production. Split out of `streamableHttp.ts` (from #4099) so it can be
// tested directly.

import { randomUUID } from "node:crypto";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type {
  EventId,
  EventStore,
  StreamId,
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export class InMemoryEventStore implements EventStore {
  private events: Map<
    EventId,
    { streamId: StreamId; message: JSONRPCMessage }
  > = new Map();

  async storeEvent(
    streamId: StreamId,
    message: JSONRPCMessage,
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
    }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> },
  ): Promise<StreamId> {
    const lastEvent = this.events.get(lastEventId);
    if (!lastEvent) {
      // The SDK asks getStreamIdForEventId first and refuses an unknown id, so
      // reaching here is a caller error: there is no stream to return.
      throw new Error(`Unknown event ID: ${lastEventId}`);
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
