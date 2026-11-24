/**
 * Protocol-level tests for the Events extension (`io.modelcontextprotocol/events`,
 * SEP-3415) on protocol version 2026-07-28 (#5651).
 *
 * The SDK client has no Events helpers, so every test drives the server with
 * raw JSON-RPC through `connectRaw`, which records the notifications a push
 * stream sends. The clock is faked: `clock-tick` occurrences are computed from
 * it, and a push stream's heartbeat and tick timers run on it, so the tests
 * step time instead of waiting for it and need no retries.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  connect,
  connectRaw,
  type RawSession,
  type Session,
} from "./harness.js";
import {
  DEFAULT_HEARTBEAT_MS,
  EVENTS_EXTENSION,
  MAX_HEARTBEAT_MS,
  MAX_STREAMS,
  MIN_HEARTBEAT_MS,
  PushStream,
  RETAINED_TICKS,
  SUBSCRIPTION_ID_META_KEY,
  TICK_PERIOD_MS,
  resetEvents,
} from "../server/events.js";

type Json = Record<string, unknown>;

/** The client declares the extension, as the spec says it MAY. */
const CAPABILITIES = { extensions: { [EVENTS_EXTENSION]: {} } };

/** The tick that has just happened when each test starts. */
const HEAD = 360_000_003;
/** Each test starts this far into the tick period after HEAD. */
const OFFSET_MS = 2_000;

const cursor = (tick: number) => `clock-tick:${tick}`;

const open: Array<{ close: () => Promise<void> }> = [];

async function raw(): Promise<RawSession> {
  const session = await connectRaw(CAPABILITIES);
  open.push(session);
  return session;
}

async function legacy(): Promise<Session> {
  const session = await connect();
  open.push(session);
  return session;
}

/** Let queued messages cross the in-memory transport. */
const settle = () => vi.advanceTimersByTimeAsync(0);

/** The notifications with this method, and their params. */
function sent(session: RawSession, method: string): Json[] {
  return session.notifications
    .filter((n) => n.method === method)
    .map((n) => n.params as Json);
}

/** The `events/*` notifications, as `[method, params]` pairs. */
function eventNotifications(session: RawSession): Array<[string, Json]> {
  return session.notifications
    .filter((n) => String(n.method).startsWith("notifications/events/"))
    .map((n) => [String(n.method), n.params as Json]);
}

/** The error of a response that must fail. */
async function errorOf(
  session: RawSession,
  method: string,
  params: Json = {},
): Promise<Json> {
  const response = await session.request(method, params);
  expect(response.result).toBeUndefined();
  return response.error as Json;
}

/** The text of a tools/call result. */
function textOfCall(result: Json): string {
  return (result.content as Array<{ text: string }>)[0].text;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(HEAD * TICK_PERIOD_MS + OFFSET_MS);
});

afterEach(async () => {
  for (const session of open.splice(0)) await session.close();
  resetEvents();
  vi.useRealTimers();
});

describe("discovery", () => {
  it("advertises the extension in server/discover", async () => {
    const session = await raw();
    const discover = await session.result("server/discover");
    expect(
      (discover.capabilities as { extensions: Json }).extensions,
    ).toMatchObject({ [EVENTS_EXTENSION]: {} });
  });

  it("lists both event types with their delivery modes and schemas", async () => {
    const session = await raw();
    const list = await session.result("events/list");
    expect(list.resultType).toBe("complete");
    expect(list.nextCursor).toBeUndefined();
    const events = list.events as Json[];
    expect(events.map((e) => [e.name, e.delivery])).toEqual([
      ["clock-tick", ["poll", "push"]],
      ["custom-event", ["push"]],
    ]);
    const [clockTick, customEvent] = events;
    expect(clockTick.inputSchema).toMatchObject({
      type: "object",
      properties: {
        everyNth: { type: "integer", default: 1 },
        label: { type: "string" },
      },
      additionalProperties: false,
    });
    expect(clockTick.payloadSchema).toMatchObject({
      type: "object",
      properties: { tick: { type: "integer" }, label: { type: "string" } },
      required: ["tick"],
    });
    expect(clockTick.inputSchema).not.toHaveProperty("$schema");
    expect(customEvent.inputSchema).toMatchObject({
      properties: {
        minSeverity: { enum: ["info", "warning", "error"], default: "info" },
      },
    });
    expect(customEvent.payloadSchema).toMatchObject({
      required: ["message", "severity"],
    });
  });

  it("refuses an events/list cursor it never minted", async () => {
    const session = await raw();
    expect(
      await errorOf(session, "events/list", { cursor: "page-2" }),
    ).toMatchObject({ code: -32602 });
  });

  it("does not serve events/* to a 2025-era client (-32601)", async () => {
    const session = await legacy();
    expect(session.client.getServerCapabilities()?.extensions).toBeUndefined();
    await expect(
      session.client.request(
        { method: "events/list", params: {} },
        z.looseObject({}),
      ),
    ).rejects.toMatchObject({ code: -32601 });
  });

  it("offers no webhook delivery: events/subscribe and events/unsubscribe are not served", async () => {
    const session = await raw();
    const params = { name: "clock-tick", arguments: {} };
    expect(await errorOf(session, "events/subscribe", params)).toMatchObject({
      code: -32601,
    });
    expect(await errorOf(session, "events/unsubscribe", params)).toMatchObject({
      code: -32601,
    });
  });
});

describe("events/poll", () => {
  it("bootstraps with a null cursor: no events and the current position", async () => {
    const session = await raw();
    for (const params of [{ cursor: null }, {}]) {
      const poll = await session.result("events/poll", {
        name: "clock-tick",
        ...params,
      });
      expect(poll).toMatchObject({
        resultType: "complete",
        events: [],
        cursor: cursor(HEAD),
        truncated: false,
        hasMore: false,
        nextPollMs: TICK_PERIOD_MS - OFFSET_MS,
      });
    }
  });

  it("replays the ticks after the cursor, each with a stable eventId", async () => {
    const session = await raw();
    const poll = await session.result("events/poll", {
      name: "clock-tick",
      cursor: cursor(HEAD - 2),
    });
    expect(poll.events).toEqual([
      {
        eventId: `tick-${HEAD - 1}`,
        name: "clock-tick",
        timestamp: new Date((HEAD - 1) * TICK_PERIOD_MS).toISOString(),
        data: { tick: HEAD - 1 },
      },
      {
        eventId: `tick-${HEAD}`,
        name: "clock-tick",
        timestamp: new Date(HEAD * TICK_PERIOD_MS).toISOString(),
        data: { tick: HEAD },
      },
    ]);
    expect(poll).toMatchObject({
      cursor: cursor(HEAD),
      truncated: false,
      hasMore: false,
    });

    // Polling again from the returned cursor finds nothing new until the
    // next tick, and then exactly that tick.
    const quiet = await session.result("events/poll", {
      name: "clock-tick",
      cursor: poll.cursor,
    });
    expect(quiet.events).toEqual([]);
    vi.advanceTimersByTime(TICK_PERIOD_MS);
    const next = await session.result("events/poll", {
      name: "clock-tick",
      cursor: poll.cursor,
    });
    expect((next.events as Json[]).map((e) => e.eventId)).toEqual([
      `tick-${HEAD + 1}`,
    ]);
  });

  it("caps a batch at maxEvents and reports the backlog with hasMore", async () => {
    const session = await raw();
    const first = await session.result("events/poll", {
      name: "clock-tick",
      cursor: cursor(HEAD - 5),
      maxEvents: 2,
    });
    expect((first.events as Json[]).map((e) => e.eventId)).toEqual([
      `tick-${HEAD - 4}`,
      `tick-${HEAD - 3}`,
    ]);
    expect(first).toMatchObject({
      cursor: cursor(HEAD - 3),
      hasMore: true,
      nextPollMs: 0,
    });

    const rest = await session.result("events/poll", {
      name: "clock-tick",
      cursor: first.cursor,
      maxEvents: 10,
    });
    expect((rest.events as Json[]).map((e) => e.eventId)).toEqual([
      `tick-${HEAD - 2}`,
      `tick-${HEAD - 1}`,
      `tick-${HEAD}`,
    ]);
    expect(rest).toMatchObject({ cursor: cursor(HEAD), hasMore: false });
  });

  it("filters with everyNth and transforms with label", async () => {
    const session = await raw();
    // HEAD - 8 and HEAD - 3 are the multiples of 5 in the last ten ticks.
    const poll = await session.result("events/poll", {
      name: "clock-tick",
      arguments: { everyNth: 5, label: "five" },
      cursor: cursor(HEAD - 10),
    });
    expect(poll.events).toEqual([
      expect.objectContaining({ data: { tick: HEAD - 8, label: "five" } }),
      expect.objectContaining({ data: { tick: HEAD - 3, label: "five" } }),
    ]);
    // The cursor advances past ticks the filter skipped.
    expect(poll).toMatchObject({ cursor: cursor(HEAD), hasMore: false });

    // hasMore counts only ticks that would be delivered.
    const capped = await session.result("events/poll", {
      name: "clock-tick",
      arguments: { everyNth: 5 },
      cursor: cursor(HEAD - 10),
      maxEvents: 1,
    });
    expect(capped).toMatchObject({ cursor: cursor(HEAD - 8), hasMore: true });
  });

  it("replays at most the retained ticks, and says it skipped some", async () => {
    const session = await raw();
    const poll = await session.result("events/poll", {
      name: "clock-tick",
      cursor: cursor(HEAD - 500),
      maxEvents: 200,
    });
    const events = poll.events as Json[];
    expect(events).toHaveLength(RETAINED_TICKS);
    expect(events[0].eventId).toBe(`tick-${HEAD - RETAINED_TICKS + 1}`);
    expect(poll).toMatchObject({ truncated: true, hasMore: false });
  });

  it("returns at most 100 events however large maxEvents is, and 50 by default", async () => {
    const session = await raw();
    const large = await session.result("events/poll", {
      name: "clock-tick",
      cursor: cursor(HEAD - 150),
      maxEvents: 1_000,
    });
    expect(large.events as Json[]).toHaveLength(100);
    const byDefault = await session.result("events/poll", {
      name: "clock-tick",
      cursor: cursor(HEAD - 90),
    });
    expect(byDefault.events as Json[]).toHaveLength(50);
    expect(byDefault.hasMore).toBe(true);
  });

  it("starts no earlier than maxAgeMs, and says so when that skips events", async () => {
    const session = await raw();
    // now - 12 s falls 2 s after tick HEAD - 2's start, so replay starts there.
    const poll = await session.result("events/poll", {
      name: "clock-tick",
      cursor: cursor(HEAD - 10),
      maxAgeMs: 12_000,
    });
    expect((poll.events as Json[]).map((e) => e.eventId)).toEqual([
      `tick-${HEAD - 2}`,
      `tick-${HEAD - 1}`,
      `tick-${HEAD}`,
    ]);
    expect(poll.truncated).toBe(true);

    // A floor older than the cursor skips nothing.
    const wide = await session.result("events/poll", {
      name: "clock-tick",
      cursor: cursor(HEAD - 2),
      maxAgeMs: 3_600_000,
    });
    expect(wide).toMatchObject({ truncated: false });
    expect(wide.events as Json[]).toHaveLength(2);

    // maxAgeMs is ignored with a null cursor, which already means now.
    const fresh = await session.result("events/poll", {
      name: "clock-tick",
      cursor: null,
      maxAgeMs: 0,
    });
    expect(fresh).toMatchObject({ events: [], truncated: false });
  });

  it("refuses a cursor it never minted", async () => {
    const session = await raw();
    for (const bad of ["garbage", cursor(HEAD + 1), "clock-tick:-1"]) {
      expect(
        await errorOf(session, "events/poll", {
          name: "clock-tick",
          cursor: bad,
        }),
      ).toMatchObject({ code: -32602, message: expect.stringContaining(bad) });
    }
  });

  it("answers an unknown event type with NotFound (-32023)", async () => {
    const session = await raw();
    expect(
      await errorOf(session, "events/poll", { name: "no-such-event" }),
    ).toEqual({
      code: -32023,
      message: "Unknown event type: no-such-event",
      data: { kind: "event" },
    });
  });

  it("answers a delivery mode the type does not offer with Unsupported (-32026)", async () => {
    const session = await raw();
    expect(
      await errorOf(session, "events/poll", { name: "custom-event" }),
    ).toMatchObject({
      code: -32026,
      data: { feature: "deliveryMode", value: "poll" },
    });
  });

  it("answers arguments that do not match the inputSchema with InvalidParams", async () => {
    const session = await raw();
    for (const args of [{ bogus: 1 }, { everyNth: 0 }, { label: 7 }]) {
      expect(
        await errorOf(session, "events/poll", {
          name: "clock-tick",
          arguments: args,
        }),
      ).toMatchObject({ code: -32602 });
    }
  });
});

describe("events/stream: clock-tick", () => {
  it("confirms, replays, delivers each tick and heartbeats in between, all tagged with the request id", async () => {
    const session = await raw();
    void session.request("events/stream", {
      name: "clock-tick",
      cursor: cursor(HEAD - 2),
      heartbeatMs: 2_000,
      arguments: { label: "push" },
    });
    const id = session.lastRequestId();
    await settle();

    // active first, then the replayed backlog.
    expect(eventNotifications(session)).toEqual([
      [
        "notifications/events/active",
        {
          cursor: cursor(HEAD - 2),
          truncated: false,
          heartbeatMs: 2_000,
          _meta: { [SUBSCRIPTION_ID_META_KEY]: id },
        },
      ],
      [
        "notifications/events/event",
        expect.objectContaining({
          eventId: `tick-${HEAD - 1}`,
          data: { tick: HEAD - 1, label: "push" },
          cursor: cursor(HEAD - 1),
          _meta: { [SUBSCRIPTION_ID_META_KEY]: id },
        }),
      ],
      [
        "notifications/events/event",
        expect.objectContaining({
          eventId: `tick-${HEAD}`,
          cursor: cursor(HEAD),
        }),
      ],
    ]);

    // 2 s of silence brings a heartbeat carrying the position checked up to.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sent(session, "notifications/events/heartbeat")).toEqual([
      { cursor: cursor(HEAD), _meta: { [SUBSCRIPTION_ID_META_KEY]: id } },
    ]);

    // The next tick arrives on time.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sent(session, "notifications/events/event").at(-1)).toMatchObject({
      eventId: `tick-${HEAD + 1}`,
      cursor: cursor(HEAD + 1),
    });
  });

  it("starts from now with a null cursor, and advances the heartbeat cursor over filtered ticks", async () => {
    const session = await raw();
    void session.request("events/stream", {
      name: "clock-tick",
      heartbeatMs: 1_000,
      arguments: { everyNth: 1_000 },
    });
    await settle();
    expect(sent(session, "notifications/events/active")).toEqual([
      expect.objectContaining({ cursor: cursor(HEAD), truncated: false }),
    ]);
    await vi.advanceTimersByTimeAsync(TICK_PERIOD_MS * 2);
    expect(sent(session, "notifications/events/event")).toEqual([]);
    expect(sent(session, "notifications/events/heartbeat").at(-1)).toEqual(
      expect.objectContaining({ cursor: cursor(HEAD + 2) }),
    );
  });

  it("reports a cursor outside the retained window as truncated on active", async () => {
    const session = await raw();
    void session.request("events/stream", {
      name: "clock-tick",
      cursor: cursor(HEAD - 1_000),
    });
    await settle();
    expect(sent(session, "notifications/events/active")).toEqual([
      expect.objectContaining({
        cursor: cursor(HEAD - RETAINED_TICKS),
        truncated: true,
        heartbeatMs: DEFAULT_HEARTBEAT_MS,
      }),
    ]);
    expect(sent(session, "notifications/events/event")).toHaveLength(
      RETAINED_TICKS,
    );
  });

  it("clamps the suggested heartbeat interval to the server's bounds", async () => {
    const session = await raw();
    for (const heartbeatMs of [1, 10_000_000]) {
      void session.request("events/stream", {
        name: "clock-tick",
        heartbeatMs,
      });
    }
    await settle();
    expect(
      sent(session, "notifications/events/active").map((p) => p.heartbeatMs),
    ).toEqual([MIN_HEARTBEAT_MS, MAX_HEARTBEAT_MS]);
  });

  it("stops delivering when the client cancels, and sends no response", async () => {
    const session = await raw();
    const response = vi.fn();
    void session
      .request("events/stream", { name: "clock-tick", heartbeatMs: 1_000 })
      .then(response);
    const id = session.lastRequestId();
    await settle();
    await session.notify("notifications/cancelled", { requestId: id });
    await settle();
    const count = session.notifications.length;
    await vi.advanceTimersByTimeAsync(TICK_PERIOD_MS * 3);
    expect(session.notifications).toHaveLength(count);
    expect(response).not.toHaveBeenCalled();
  });

  it("refuses an invalid subscription with an error and opens no stream", async () => {
    const session = await raw();
    expect(
      await errorOf(session, "events/stream", {
        name: "clock-tick",
        arguments: { everyNth: "often" },
      }),
    ).toMatchObject({ code: -32602 });
    expect(
      await errorOf(session, "events/stream", {
        name: "clock-tick",
        cursor: "garbage",
      }),
    ).toMatchObject({ code: -32602 });
    expect(
      await errorOf(session, "events/stream", { name: "nope" }),
    ).toMatchObject({ code: -32023 });
    expect(eventNotifications(session)).toEqual([]);
  });
});

describe("events/stream: custom-event and trigger-event", () => {
  it("delivers what trigger-event raises, filtered by minSeverity, with a null cursor", async () => {
    const session = await raw();
    void session.request("events/stream", {
      name: "custom-event",
      arguments: { minSeverity: "warning" },
      heartbeatMs: 5_000,
    });
    const id = session.lastRequestId();
    await settle();
    expect(sent(session, "notifications/events/active")).toEqual([
      {
        cursor: null,
        truncated: false,
        heartbeatMs: 5_000,
        _meta: { [SUBSCRIPTION_ID_META_KEY]: id },
      },
    ]);

    const info = await session.call("trigger-event", { message: "quiet" });
    expect(textOfCall(info)).toBe(
      "Sent custom-event (info) to 1 open custom-event stream",
    );
    await session.call("trigger-event", {
      message: "loud",
      severity: "warning",
    });
    await settle();
    const events = sent(session, "notifications/events/event");
    expect(events).toEqual([
      {
        eventId: expect.stringMatching(/^custom-[0-9a-f-]{36}$/),
        name: "custom-event",
        timestamp: new Date().toISOString(),
        data: { message: "loud", severity: "warning" },
        cursor: null,
        _meta: { [SUBSCRIPTION_ID_META_KEY]: id },
      },
    ]);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(sent(session, "notifications/events/heartbeat")).toEqual([
      { cursor: null, _meta: { [SUBSCRIPTION_ID_META_KEY]: id } },
    ]);
  });

  it("reaches streams opened through another connection", async () => {
    const listener = await raw();
    const caller = await raw();
    void listener.request("events/stream", { name: "custom-event" });
    void listener.request("events/stream", { name: "custom-event" });
    await settle();
    const result = await caller.call("trigger-event", {});
    expect(textOfCall(result)).toBe(
      "Sent custom-event (info) to 2 open custom-event streams",
    );
    await settle();
    expect(sent(listener, "notifications/events/event")).toHaveLength(2);
  });

  it("sends a recoverable error and keeps the stream open", async () => {
    const session = await raw();
    void session.request("events/stream", { name: "custom-event" });
    await settle();
    const result = await session.call("trigger-event", {
      kind: "error",
      message: "upstream 503",
    });
    expect(textOfCall(result)).toBe(
      "Sent notifications/events/error to 1 open custom-event stream",
    );
    await settle();
    expect(sent(session, "notifications/events/error")).toEqual([
      expect.objectContaining({
        error: {
          code: -32603,
          message: "UpstreamError",
          data: { reason: "upstream 503" },
        },
      }),
    ]);
    await session.call("trigger-event", {});
    await settle();
    expect(sent(session, "notifications/events/event")).toHaveLength(1);
  });

  it("terminates the subscription and ends the stream with an empty result", async () => {
    const session = await raw();
    const stream = session.request("events/stream", { name: "custom-event" });
    const id = session.lastRequestId();
    await settle();
    const result = await session.call("trigger-event", {
      kind: "terminate",
      message: "access revoked",
    });
    expect(textOfCall(result)).toBe(
      "Sent notifications/events/terminated to 1 open custom-event stream",
    );
    expect(sent(session, "notifications/events/terminated")).toEqual([
      {
        error: {
          code: -32024,
          message: "Forbidden",
          data: { reason: "access revoked" },
        },
        _meta: { [SUBSCRIPTION_ID_META_KEY]: id },
      },
    ]);
    const response = await stream;
    expect(response.result).toMatchObject({
      resultType: "complete",
      _meta: { [SUBSCRIPTION_ID_META_KEY]: id },
    });

    // The subscription is gone.
    const after = await session.call("trigger-event", {});
    expect(textOfCall(after)).toBe(
      "Sent custom-event (info) to 0 open custom-event streams",
    );
  });

  it("closes a connection's streams when the connection ends", async () => {
    const listener = await raw();
    const caller = await raw();
    void listener.request("events/stream", { name: "custom-event" });
    await settle();
    await listener.close();
    expect(textOfCall(await caller.call("trigger-event", {}))).toBe(
      "Sent custom-event (info) to 0 open custom-event streams",
    );
  });
});

describe("stream limit", () => {
  it(`refuses stream ${MAX_STREAMS + 1} with ResourceExhausted (-32025), and frees a slot when one ends`, async () => {
    const holder = await raw();
    for (let i = 0; i < MAX_STREAMS; i++) {
      void holder.request("events/stream", { name: "custom-event" });
    }
    await settle();
    const session = await raw();
    expect(
      await errorOf(session, "events/stream", { name: "clock-tick" }),
    ).toEqual({
      code: -32025,
      message: `The server already has ${MAX_STREAMS} event streams open, its limit`,
      data: { limit: "streams", max: MAX_STREAMS },
    });

    await holder.close();
    void session.request("events/stream", { name: "clock-tick" });
    await settle();
    expect(sent(session, "notifications/events/active")).toHaveLength(1);
  });
});

describe("PushStream", () => {
  it("ends when a send fails, and sends nothing after", async () => {
    const notify = vi.fn().mockRejectedValue(new Error("connection gone"));
    const stream = new PushStream({ id: 9, notify }, 1_000, () => null);
    const released = vi.fn();
    stream.onClose(released);
    stream.send("notifications/events/active", { cursor: null });
    await stream.ended();
    expect(stream.isClosed).toBe(true);
    expect(released).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();

    // Closed for good: no further sends, no heartbeat, no second release.
    stream.send("notifications/events/event", {});
    stream.close();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(notify).toHaveBeenCalledOnce();
    expect(released).toHaveBeenCalledOnce();
  });
});
