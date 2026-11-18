/**
 * The timing of idle-session eviction (#5558), with fake timers and no HTTP:
 * what `SESSION_IDLE_TIMEOUT_MILLIS` is read as, that a session is evicted
 * once, only after it has had no open response for the timeout, and that a
 * timeout of 0 and `stop()` both end the watching. A response is an
 * `EventEmitter` here, since "close" is all the module listens for. What
 * eviction does to a real session is in `streamable-http.test.ts`.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SESSION_IDLE_TIMEOUT_MILLIS,
  sessionIdleTimeoutMillis,
  watchIdleSessions,
} from "../transports/idle-sessions.js";

describe("sessionIdleTimeoutMillis", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 30 minutes", () => {
    expect(DEFAULT_SESSION_IDLE_TIMEOUT_MILLIS).toBe(1_800_000);
    expect(sessionIdleTimeoutMillis(undefined)).toBe(1_800_000);
  });

  it("reads SESSION_IDLE_TIMEOUT_MILLIS from the environment", () => {
    vi.stubEnv("SESSION_IDLE_TIMEOUT_MILLIS", "5000");
    expect(sessionIdleTimeoutMillis()).toBe(5000);
  });

  it("takes a number of milliseconds, and 0 as disabled", () => {
    expect(sessionIdleTimeoutMillis("60000")).toBe(60_000);
    expect(sessionIdleTimeoutMillis(" 250 ")).toBe(250);
    expect(sessionIdleTimeoutMillis("0")).toBe(0);
  });

  it.each(["", "   ", "-1", "soon", "Infinity"])(
    "falls back to the default for %j",
    (value) => {
      expect(sessionIdleTimeoutMillis(value)).toBe(
        DEFAULT_SESSION_IDLE_TIMEOUT_MILLIS,
      );
    },
  );
});

describe("watchIdleSessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("evicts a session once, after it has been idle for the timeout", () => {
    const evict = vi.fn();
    const idle = watchIdleSessions(5000, evict);
    idle.add("a");
    vi.advanceTimersByTime(4999);
    expect(evict).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(evict).toHaveBeenCalledExactlyOnceWith("a");
    vi.advanceTimersByTime(60_000);
    expect(evict).toHaveBeenCalledOnce();
    idle.stop();
  });

  it("keeps a session with an open response, and times it from when the response closes", () => {
    const evict = vi.fn();
    const idle = watchIdleSessions(5000, evict);
    idle.add("active");
    idle.add("abandoned");
    const stream = new EventEmitter();
    const call = new EventEmitter();
    idle.hold("active", stream);
    idle.hold("active", call);
    vi.advanceTimersByTime(5000);
    expect(evict).toHaveBeenCalledExactlyOnceWith("abandoned");

    // One of two responses closing leaves the session in use.
    call.emit("close");
    vi.advanceTimersByTime(60_000);
    expect(evict).toHaveBeenCalledOnce();

    // The clock starts when the last one closes, not when it opened.
    stream.emit("close");
    vi.advanceTimersByTime(4999);
    expect(evict).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(evict).toHaveBeenLastCalledWith("active");
    expect(evict).toHaveBeenCalledTimes(2);
    idle.stop();
  });

  it("restarts a session's clock on each request", () => {
    const evict = vi.fn();
    const idle = watchIdleSessions(5000, evict);
    idle.add("a");
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(4000);
      const res = new EventEmitter();
      idle.hold("a", res);
      res.emit("close");
    }
    expect(evict).not.toHaveBeenCalled();
    idle.stop();
  });

  it("does not evict a session that was removed, or hold one it does not watch", () => {
    const evict = vi.fn();
    const idle = watchIdleSessions(5000, evict);
    idle.add("ended");
    idle.remove("ended");
    const res = new EventEmitter();
    idle.hold("unknown", res);
    expect(res.listenerCount("close")).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(evict).not.toHaveBeenCalled();
    idle.stop();
  });

  it("looks for idle sessions every tenth of the timeout", () => {
    const evict = vi.fn();
    const idle = watchIdleSessions(50_000, evict);
    // Idle from 2 s in: past the timeout at 52 s, and seen at the 55 s look.
    vi.advanceTimersByTime(2000);
    idle.add("a");
    vi.advanceTimersByTime(52_999);
    expect(evict).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(evict).toHaveBeenCalledExactlyOnceWith("a");
    idle.stop();
  });

  it("looks at least every minute, however long the timeout", () => {
    const evict = vi.fn();
    const idle = watchIdleSessions(30 * 60_000, evict);
    vi.advanceTimersByTime(60_000);
    idle.add("a");
    // Idle from 1:00, so past the timeout at 31:00, the next look.
    vi.advanceTimersByTime(30 * 60_000 - 1);
    expect(evict).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(evict).toHaveBeenCalledExactlyOnceWith("a");
    idle.stop();
  });

  it("looks no more often than once a second when the timeout is shorter", () => {
    const evict = vi.fn();
    const idle = watchIdleSessions(10, evict);
    idle.add("a");
    vi.advanceTimersByTime(999);
    expect(evict).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(evict).toHaveBeenCalledExactlyOnceWith("a");
    idle.stop();
  });

  it("never evicts, and runs no timer, when the timeout is 0", () => {
    const evict = vi.fn();
    const idle = watchIdleSessions(0, evict);
    expect(vi.getTimerCount()).toBe(0);
    idle.add("a");
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(evict).not.toHaveBeenCalled();
    idle.stop();
  });

  it("stops looking once stopped", () => {
    const evict = vi.fn();
    const idle = watchIdleSessions(5000, evict);
    idle.add("a");
    idle.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(evict).not.toHaveBeenCalled();
  });
});
