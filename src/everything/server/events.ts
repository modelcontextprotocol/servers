// The server side of the Events extension (`io.modelcontextprotocol/events`,
// SEP-3415) on the 2026-07-28 revision (#5651).
//
// A client lists the server's event types with `events/list`, then receives
// their occurrences by polling (`events/poll`) or over a long-lived push
// stream (`events/stream`). The SDK has no server implementation of the
// extension yet (modelcontextprotocol/typescript-sdk#3209), so this module is
// one, built on the SDK's custom request handlers, as `tasks.ts` is for Tasks.
//
// Two synthetic event types cover the extension's two cursor models without
// an upstream service:
// - `clock-tick` (poll and push) is replayable. Tick k happens at k × the
//   tick period since the Unix epoch, so every occurrence can be computed
//   from the clock and its cursor is just the tick index. Nothing is stored,
//   which matters because on the 2026-07-28 HTTP path every request gets a
//   fresh server instance. Only the last RETAINED_TICKS ticks can be
//   replayed, which gives `truncated: true` a real trigger.
// - `custom-event` (push only) is emit-only. The `trigger-event` tool raises
//   it on a process-wide bus, so a stream served by one instance sees an event
//   raised through another. It has no history, so its cursor is always null.
//
// Webhook delivery (`events/subscribe`, `events/unsubscribe`) is not offered:
// the extension requires an authenticated principal for it, and this server
// has none, so those methods are left unregistered and answer -32601. The
// extension is served on 2026-07-28 only; a 2025-era client gets -32601 for
// every `events/*` method.

import { randomUUID } from "node:crypto";
import {
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  type ServerContext as RequestContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ServerContext } from "./context.js";

/** The extension's identifier, as declared in `capabilities.extensions`. */
export const EVENTS_EXTENSION = "io.modelcontextprotocol/events";

/** The `_meta` key that ties a push notification to its `events/stream`. */
export const SUBSCRIPTION_ID_META_KEY =
  "io.modelcontextprotocol/subscriptionId";

/** The extension's error codes (its Error Handling table). */
export const EventsErrorCode = {
  NotFound: -32023,
  Forbidden: -32024,
  ResourceExhausted: -32025,
  Unsupported: -32026,
} as const;

/** How often `clock-tick` fires. */
export const TICK_PERIOD_MS = 5_000;

/** How many past ticks a `clock-tick` cursor can replay. */
export const RETAINED_TICKS = 100;

/** The most events one `events/poll` returns, and its default. */
export const MAX_POLL_EVENTS = 100;
const DEFAULT_POLL_EVENTS = 50;

/** The bounds and default of a push stream's heartbeat interval. */
export const MIN_HEARTBEAT_MS = 1_000;
export const MAX_HEARTBEAT_MS = 60_000;
export const DEFAULT_HEARTBEAT_MS = 30_000;

/** The shortest `nextPollMs` the server suggests when it has no backlog. */
const MIN_POLL_INTERVAL_MS = 1_000;

/**
 * The most push streams the process holds open at once. Each is a long-lived
 * request with a timer, so without a cap a client could open them until the
 * process runs out of memory; past it, a new stream is refused with
 * ResourceExhausted.
 */
export const MAX_STREAMS = 100;

const Severity = z.enum(["info", "warning", "error"]);
type Severity = z.infer<typeof Severity>;
const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  warning: 1,
  error: 2,
};

const ClockTickArguments = z.strictObject({
  everyNth: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(1)
    .describe("A filter: deliver only ticks whose index is a multiple of this"),
  label: z
    .string()
    .max(100)
    .optional()
    .describe("A transform: copied into each delivered payload as `label`"),
});

const ClockTickPayload = z.object({
  tick: z.number().int().describe("The tick's index since the Unix epoch"),
  label: z.string().optional().describe("The subscription's `label` argument"),
});

const CustomEventArguments = z.strictObject({
  minSeverity: Severity.default("info").describe(
    "A filter: deliver only events at this severity or above",
  ),
});

const CustomEventPayload = z.object({
  message: z.string().describe("The message passed to trigger-event"),
  severity: Severity.describe("The severity passed to trigger-event"),
});

type Delivery = "poll" | "push";

/** One event type this server offers. */
type EventType = {
  name: string;
  description: string;
  delivery: Delivery[];
  arguments: z.ZodType;
  payload: z.ZodType;
};

const EVENT_TYPES: EventType[] = [
  {
    name: "clock-tick",
    description: `Fires every ${TICK_PERIOD_MS / 1000} seconds. Replayable: a cursor can resume up to ${RETAINED_TICKS} ticks back.`,
    delivery: ["poll", "push"],
    arguments: ClockTickArguments,
    payload: ClockTickPayload,
  },
  {
    name: "custom-event",
    description:
      "Fires when the trigger-event tool is called. Emit-only: it has no history, so its cursor is always null.",
    delivery: ["push"],
    arguments: CustomEventArguments,
    payload: CustomEventPayload,
  },
];

/** A JSON Schema for `schema`, without the `$schema` dialect marker. */
function jsonSchema(
  schema: z.ZodType,
  io: "input" | "output",
): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io });
  return rest;
}

/** The descriptors `events/list` returns. */
function descriptors(): Record<string, unknown>[] {
  return EVENT_TYPES.map((type) => ({
    name: type.name,
    description: type.description,
    delivery: type.delivery,
    inputSchema: jsonSchema(type.arguments, "input"),
    payloadSchema: jsonSchema(type.payload, "output"),
  }));
}

/** The event type named `name`, or NotFound. */
function findType(name: string): EventType {
  const type = EVENT_TYPES.find((t) => t.name === name);
  if (!type) {
    throw new ProtocolError(
      EventsErrorCode.NotFound,
      `Unknown event type: ${name}`,
      { kind: "event" },
    );
  }
  return type;
}

/** Refuse a delivery mode the event type does not offer. */
function requireDelivery(type: EventType, mode: Delivery): void {
  if (!type.delivery.includes(mode)) {
    throw new ProtocolError(
      EventsErrorCode.Unsupported,
      `Event type ${type.name} does not support ${mode} delivery`,
      { feature: "deliveryMode", value: mode },
    );
  }
}

/** Parse a subscription's arguments against the type's schema. */
function parseArguments<T extends z.ZodType>(
  schema: T,
  name: string,
  args: unknown,
): z.infer<T> {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    throw new ProtocolError(
      ProtocolErrorCode.InvalidParams,
      `Invalid arguments for event type ${name}: ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// clock-tick: positions, cursors and replay
// ---------------------------------------------------------------------------

const CURSOR_PREFIX = "clock-tick:";

/** The index of the latest tick that has happened at `now`. */
function headAt(now: number): number {
  return Math.floor(now / TICK_PERIOD_MS);
}

function formatCursor(tick: number): string {
  return `${CURSOR_PREFIX}${tick}`;
}

/** The tick a cursor names, or InvalidParams for one this server never minted. */
function parseCursor(cursor: string, head: number): number {
  const match = /^clock-tick:(\d{1,15})$/.exec(cursor);
  const tick = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(tick) || tick > head) {
    throw new ProtocolError(
      ProtocolErrorCode.InvalidParams,
      `Invalid cursor for clock-tick: ${cursor}`,
    );
  }
  return tick;
}

/**
 * Where delivery starts for a subscription: the first tick to check, and
 * whether ticks after the client's cursor were skipped to get there.
 *
 * A null (or absent) cursor means "start from now": nothing is replayed and
 * `maxAgeMs` is ignored. Otherwise replay starts after the cursor, but no
 * earlier than `now - maxAgeMs` or the oldest retained tick, and moving past
 * the cursor for either reason is reported as `truncated`.
 */
function startFor(
  cursor: string | null | undefined,
  maxAgeMs: number | undefined,
  now: number,
): { from: number; truncated: boolean } {
  const head = headAt(now);
  if (cursor === null || cursor === undefined) {
    return { from: head + 1, truncated: false };
  }
  const after = parseCursor(cursor, head) + 1;
  let from = Math.max(after, head - RETAINED_TICKS + 1);
  if (maxAgeMs !== undefined) {
    from = Math.max(from, Math.ceil((now - maxAgeMs) / TICK_PERIOD_MS));
  }
  return { from, truncated: from > after };
}

type ClockTickArgs = z.infer<typeof ClockTickArguments>;

function tickMatches(tick: number, args: ClockTickArgs): boolean {
  return tick % args.everyNth === 0;
}

/** One `clock-tick` occurrence, without its cursor. */
function tickOccurrence(
  tick: number,
  args: ClockTickArgs,
): Record<string, unknown> {
  return {
    eventId: `tick-${tick}`,
    name: "clock-tick",
    timestamp: new Date(tick * TICK_PERIOD_MS).toISOString(),
    data: { tick, ...(args.label !== undefined && { label: args.label }) },
  };
}

// ---------------------------------------------------------------------------
// custom-event: the process-wide bus
// ---------------------------------------------------------------------------

/** What `trigger-event` asks the open `custom-event` streams to do. */
export type CustomEventSignal =
  | { kind: "event"; message: string; severity: Severity }
  | { kind: "error"; message: string }
  | { kind: "terminate"; message: string };

/**
 * A signal as the bus hands it to each stream: an event carries the identity
 * and time minted once for it, so every subscription it matches receives the
 * same `eventId` and `timestamp`, as the extension requires of one occurrence.
 */
type BusMessage =
  | (Extract<CustomEventSignal, { kind: "event" }> & {
      eventId: string;
      timestamp: string;
    })
  | Exclude<CustomEventSignal, { kind: "event" }>;

/** Every open `custom-event` stream, across every server instance. */
const customListeners = new Set<(message: BusMessage) => void>();

/**
 * Hand a signal to every open `custom-event` stream, and return how many there
 * were. Each stream applies its own `minSeverity` filter to an event.
 */
export function emitCustomEvent(signal: CustomEventSignal): number {
  const message: BusMessage =
    signal.kind === "event"
      ? {
          ...signal,
          eventId: `custom-${randomUUID()}`,
          timestamp: new Date().toISOString(),
        }
      : signal;
  // Copied first: a terminate closes each stream, which removes its listener.
  const listeners = [...customListeners];
  for (const listener of listeners) listener(message);
  return listeners.length;
}

/** How many push streams are open in the process. */
let openStreams = 0;

/** Forget every open stream. For tests. */
export function resetEvents(): void {
  customListeners.clear();
  openStreams = 0;
}

// ---------------------------------------------------------------------------
// Push streams
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

/** What a push stream needs of the `events/stream` request it serves. */
type StreamRequest = Pick<RequestContext["mcpReq"], "id" | "notify">;

/**
 * One open `events/stream`: sends its notifications in order, keeps the
 * heartbeat going whenever nothing else has been sent for the granted
 * interval, and resolves `done` when it ends. Exported for its unit tests,
 * which cover the failed send no in-process transport can produce.
 */
export class PushStream {
  readonly done: Promise<void>;
  private finish!: () => void;
  private chain: Promise<void> = Promise.resolve();
  private heartbeat?: NodeJS.Timeout;
  private readonly cleanups: Array<() => void> = [];
  private closed = false;
  /** Set by an abrupt end: notifications still queued are dropped. */
  private discarding = false;

  /** Whether the stream has ended. */
  get isClosed(): boolean {
    return this.closed;
  }

  constructor(
    private readonly request: StreamRequest,
    private readonly heartbeatMs: number,
    private readonly cursor: () => string | null,
  ) {
    this.done = new Promise((resolve) => (this.finish = resolve));
  }

  /** The `_meta` every notification on this stream carries. */
  get meta(): Json {
    return { [SUBSCRIPTION_ID_META_KEY]: this.request.id };
  }

  /** Queue a notification, and restart the heartbeat interval. */
  send(method: string, params: Json): void {
    if (this.closed) return;
    this.armHeartbeat();
    const notification = { method, params: { ...params, _meta: this.meta } };
    this.chain = this.chain
      .then(() =>
        this.discarding ? undefined : this.request.notify(notification),
      )
      // A send fails only when the connection is gone, so the stream is too.
      .catch(() => this.abort());
  }

  /** Run `fn` when the stream ends. */
  onClose(fn: () => void): void {
    this.cleanups.push(fn);
  }

  /**
   * End the stream abruptly (the client cancelled, a send failed, or the
   * connection ended): release it, and send nothing still queued, since the
   * extension says delivery stops at cancellation.
   */
  abort(): void {
    this.discarding = true;
    this.close();
  }

  /**
   * End the stream gracefully: release it, but send what is already queued
   * (a `terminated` goes out before the final result). Safe to call more than
   * once.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.heartbeat);
    for (const fn of this.cleanups.splice(0)) fn();
    this.finish();
  }

  /** Wait for the stream to end and for its last notification to be sent. */
  async ended(): Promise<void> {
    await this.done;
    await this.chain;
  }

  private armHeartbeat(): void {
    clearTimeout(this.heartbeat);
    this.heartbeat = setTimeout(
      () =>
        this.send("notifications/events/heartbeat", { cursor: this.cursor() }),
      this.heartbeatMs,
    );
  }
}

/** Run a `clock-tick` subscription on `stream` until it closes. */
function runClockTick(
  stream: PushStream,
  args: ClockTickArgs,
  start: { from: number; truncated: boolean },
  heartbeatMs: number,
  position: { checked: number },
): void {
  stream.send("notifications/events/active", {
    cursor: formatCursor(position.checked),
    truncated: start.truncated,
    heartbeatMs,
  });

  let timer: NodeJS.Timeout | undefined;
  // Deliver every tick up to now that has not been checked yet (the replayed
  // backlog, on the first call), then wait for the next one.
  const catchUp = () => {
    const head = headAt(Date.now());
    // A timer that fires late (the process was suspended, or the clock jumped
    // forward) replays no more than a new stream would, and reports the gap
    // as the extension asks: a fresh `active` with `truncated: true`.
    const oldest = head - RETAINED_TICKS + 1;
    if (position.checked + 1 < oldest) {
      position.checked = oldest - 1;
      stream.send("notifications/events/active", {
        cursor: formatCursor(position.checked),
        truncated: true,
        heartbeatMs,
      });
    }
    for (let tick = position.checked + 1; tick <= head; tick++) {
      position.checked = tick;
      if (tickMatches(tick, args)) {
        stream.send("notifications/events/event", {
          ...tickOccurrence(tick, args),
          cursor: formatCursor(tick),
        });
      }
    }
    timer = setTimeout(
      catchUp,
      (position.checked + 1) * TICK_PERIOD_MS - Date.now(),
    );
  };
  stream.onClose(() => clearTimeout(timer));
  catchUp();
}

/** Run a `custom-event` subscription on `stream` until it closes. */
function runCustomEvent(
  stream: PushStream,
  args: z.infer<typeof CustomEventArguments>,
  heartbeatMs: number,
): void {
  stream.send("notifications/events/active", {
    cursor: null,
    truncated: false,
    heartbeatMs,
  });
  const listener = (signal: BusMessage) => {
    switch (signal.kind) {
      case "event":
        if (SEVERITY_RANK[signal.severity] >= SEVERITY_RANK[args.minSeverity]) {
          stream.send("notifications/events/event", {
            eventId: signal.eventId,
            name: "custom-event",
            timestamp: signal.timestamp,
            data: { message: signal.message, severity: signal.severity },
            cursor: null,
          });
        }
        break;
      case "error":
        stream.send("notifications/events/error", {
          error: {
            code: ProtocolErrorCode.InternalError,
            message: "UpstreamError",
            data: { reason: signal.message },
          },
        });
        break;
      case "terminate":
        stream.send("notifications/events/terminated", {
          error: {
            code: EventsErrorCode.Forbidden,
            message: "Forbidden",
            data: { reason: signal.message },
          },
        });
        stream.close();
        break;
    }
  };
  customListeners.add(listener);
  stream.onClose(() => customListeners.delete(listener));
}

// ---------------------------------------------------------------------------
// The methods
// ---------------------------------------------------------------------------

const Cursor = z.string().nullable().optional();

const ListParams = z.object({
  cursor: z.string().optional().describe("A pagination cursor"),
});

const SubscriptionParams = {
  name: z.string().describe("The event type to subscribe to"),
  arguments: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("The subscription's arguments, per the type's inputSchema"),
  cursor: Cursor.describe("Where to resume; null means start from now"),
  maxAgeMs: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Do not replay events older than this many milliseconds"),
};

const PollParams = z.object({
  ...SubscriptionParams,
  maxEvents: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("The most events to return"),
});

const StreamParams = z.object({
  ...SubscriptionParams,
  heartbeatMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("The suggested heartbeat interval"),
});

const LooseResult = z.looseObject({});

/**
 * Serve the extension's methods on a 2026-07-28 server: `events/list`,
 * `events/poll` and `events/stream`.
 *
 * @param {McpServer} server - The 2026-07-28 server to serve them on.
 * @param {ServerContext} context - The instance's context, whose cleanup
 *   closes the streams it still has open.
 */
export function registerEventsExtension(
  server: McpServer,
  context: ServerContext,
): void {
  const streams = new Set<PushStream>();
  context.onCleanup(() => {
    for (const stream of streams) stream.abort();
  });

  server.server.setRequestHandler(
    "events/list",
    { params: ListParams, result: LooseResult },
    async ({ cursor }) => {
      // Every type fits on one page, so no cursor was ever minted.
      if (cursor !== undefined) {
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          `Invalid cursor for events/list: ${cursor}`,
        );
      }
      return { events: descriptors() };
    },
  );

  server.server.setRequestHandler(
    "events/poll",
    { params: PollParams, result: LooseResult },
    async (params) => {
      const type = findType(params.name);
      requireDelivery(type, "poll");
      // Only clock-tick offers poll.
      const args = parseArguments(
        ClockTickArguments,
        type.name,
        params.arguments,
      );
      const now = Date.now();
      const head = headAt(now);
      const start = startFor(params.cursor, params.maxAgeMs, now);
      const maxEvents = Math.min(
        params.maxEvents ?? DEFAULT_POLL_EVENTS,
        MAX_POLL_EVENTS,
      );

      const events: Json[] = [];
      let checked = start.from - 1;
      while (checked < head && events.length < maxEvents) {
        checked++;
        if (tickMatches(checked, args)) {
          events.push(tickOccurrence(checked, args));
        }
      }
      let hasMore = false;
      for (let tick = checked + 1; tick <= head && !hasMore; tick++) {
        hasMore = tickMatches(tick, args);
      }
      return {
        events,
        cursor: formatCursor(checked),
        truncated: start.truncated,
        hasMore,
        nextPollMs: hasMore
          ? 0
          : Math.max(MIN_POLL_INTERVAL_MS, (head + 1) * TICK_PERIOD_MS - now),
      };
    },
  );

  server.server.setRequestHandler(
    "events/stream",
    { params: StreamParams, result: LooseResult },
    async (params, ctx) => {
      const type = findType(params.name);
      requireDelivery(type, "push");
      const heartbeatMs = Math.min(
        MAX_HEARTBEAT_MS,
        Math.max(MIN_HEARTBEAT_MS, params.heartbeatMs ?? DEFAULT_HEARTBEAT_MS),
      );

      // Validate everything before the stream opens: an invalid subscription
      // is answered with an error and no stream.
      let run: (stream: PushStream) => void;
      let cursor: () => string | null;
      if (type.name === "clock-tick") {
        const args = parseArguments(
          ClockTickArguments,
          type.name,
          params.arguments,
        );
        const start = startFor(params.cursor, params.maxAgeMs, Date.now());
        const position = { checked: start.from - 1 };
        cursor = () => formatCursor(position.checked);
        run = (stream) =>
          runClockTick(stream, args, start, heartbeatMs, position);
      } else {
        const args = parseArguments(
          CustomEventArguments,
          type.name,
          params.arguments,
        );
        cursor = () => null;
        run = (stream) => runCustomEvent(stream, args, heartbeatMs);
      }
      if (openStreams >= MAX_STREAMS) {
        throw new ProtocolError(
          EventsErrorCode.ResourceExhausted,
          `The server already has ${MAX_STREAMS} event streams open, its limit`,
          { limit: "streams", max: MAX_STREAMS },
        );
      }

      const stream = new PushStream(ctx.mcpReq, heartbeatMs, cursor);
      openStreams++;
      streams.add(stream);
      stream.onClose(() => {
        openStreams--;
        streams.delete(stream);
      });
      // Cancellation (notifications/cancelled on stdio, an abort on HTTP)
      // ends the stream and releases its timers and listener.
      const signal = ctx.mcpReq.signal;
      const abort = () => stream.abort();
      signal.addEventListener("abort", abort, { once: true });
      stream.onClose(() => signal.removeEventListener("abort", abort));
      // An already-aborted signal never fires its abort event, so check it.
      /* v8 ignore next -- the SDK dispatches no request it has already seen cancelled */
      if (signal.aborted) stream.abort();
      else run(stream);
      await stream.ended();
      // The final frame, when the server ends the stream; the SDK sends no
      // response to a request the client cancelled.
      return { _meta: stream.meta };
    },
  );
}
