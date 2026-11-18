// Idle-session eviction for the Streamable HTTP transport's 2025-era sessions
// (#5558).
//
// A 2025-era session holds a server instance, a transport and an event store
// until its client ends it with a DELETE. A client that initializes and then
// goes away never does, so without this every abandoned session stayed in
// memory for the life of the process. The spec lets a server end a session at
// any time, after which it answers that session id with 404 and the client
// starts a new one, so an idle session is closed after a timeout.
//
// "Idle" means no request in flight and no stream open: every request served
// for a session is held as activity until its response closes, so a session
// with an open SSE stream, or a tool call still running, is never evicted
// however long it has been quiet. The clock starts when the last response
// closes.
//
// This module only decides when; the transport manager supplies what evicting
// means (closing the session's transport). It is kept apart from
// `streamableHttp.ts` so the timing can be tested with fake timers and no
// HTTP. The HTTP+SSE transport needs none of this: its session is its
// `GET /sse` stream, and it is cleaned up when that stream's socket closes.

/** How long a session may sit idle before it is evicted, by default: 30 minutes. */
export const DEFAULT_SESSION_IDLE_TIMEOUT_MILLIS = 30 * 60 * 1000;

/**
 * Idle sessions are looked for every tenth of the timeout, so one is evicted
 * at most a tenth late, but no less often than this ...
 */
const MAX_SWEEP_INTERVAL_MILLIS = 60 * 1000;

/** ... and no more often than this, however short the timeout. */
const MIN_SWEEP_INTERVAL_MILLIS = 1000;

/**
 * The idle timeout `SESSION_IDLE_TIMEOUT_MILLIS` asks for, in milliseconds:
 * `0` disables eviction, and anything that is not a non-negative number
 * (unset, empty, negative, not a number) means the default.
 */
export function sessionIdleTimeoutMillis(
  value: string | undefined = process.env.SESSION_IDLE_TIMEOUT_MILLIS,
): number {
  const millis = Number(value?.trim() || NaN);
  return Number.isFinite(millis) && millis >= 0
    ? millis
    : DEFAULT_SESSION_IDLE_TIMEOUT_MILLIS;
}

/** The part of a response this module needs: to learn when it has closed. */
export type ClosableResponse = {
  once(event: "close", listener: () => void): unknown;
};

/** The sessions being watched for idleness. */
export type IdleSessions = {
  /** Start watching a session; it is idle from now. */
  add(sessionId: string): void;
  /** Count a request as the session's activity until its response closes. */
  hold(sessionId: string, res: ClosableResponse): void;
  /** Stop watching a session that has ended. */
  remove(sessionId: string): void;
  /** Stop looking for idle sessions, for shutdown. */
  stop(): void;
};

type Activity = {
  /** Requests whose responses are still open. */
  open: number;
  /** When `open` last reached zero. */
  idleSince: number;
};

/**
 * Watch sessions for idleness, calling `evict` once for each session that has
 * had no open response for `timeoutMillis`. A session is checked on a timer
 * (unref'd, so it never keeps the process alive) that fires every tenth of
 * the timeout, kept between a second and a minute, so it is evicted within
 * one such interval after its timeout. A `timeoutMillis` of `0` disables
 * eviction: no timer runs and nothing is ever evicted.
 */
export function watchIdleSessions(
  timeoutMillis: number,
  evict: (sessionId: string) => void,
): IdleSessions {
  const sessions = new Map<string, Activity>();

  const sweep = () => {
    const now = Date.now();
    for (const [sessionId, activity] of [...sessions]) {
      if (activity.open === 0 && now - activity.idleSince >= timeoutMillis) {
        sessions.delete(sessionId);
        evict(sessionId);
      }
    }
  };

  const timer =
    timeoutMillis > 0
      ? setInterval(
          sweep,
          Math.max(
            MIN_SWEEP_INTERVAL_MILLIS,
            Math.min(timeoutMillis / 10, MAX_SWEEP_INTERVAL_MILLIS),
          ),
        ).unref()
      : undefined;

  return {
    add(sessionId) {
      sessions.set(sessionId, { open: 0, idleSince: Date.now() });
    },
    hold(sessionId, res) {
      const activity = sessions.get(sessionId);
      if (!activity) return;
      activity.open++;
      res.once("close", () => {
        activity.open--;
        activity.idleSince = Date.now();
      });
    },
    remove(sessionId) {
      sessions.delete(sessionId);
    },
    stop() {
      clearInterval(timer);
    },
  };
}
