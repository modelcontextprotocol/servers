/**
 * Characterizes the simulated logging that `toggle-simulated-logging` drives
 * (#4854): a random-leveled `notifications/message` at once and then every
 * five seconds, filtered by the level the client set with `logging/setLevel`,
 * per session, until toggled off or the session is cleaned up. The timer
 * belongs to the server instance serving the session, so the messages no
 * longer name a session id (#4852). The tool is 2025-era only; its 2026-07-28
 * replacement, `trigger-log-messages`, is covered by modern.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connect,
  contentOf,
  ofMethod,
  textOf,
  type Session,
} from "./harness.js";

let session: Session;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  session = await connect();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await session.close();
});

function messages(s: Session = session) {
  return ofMethod(s.notifications, "notifications/message").map(
    (n) => n.params,
  );
}

async function toggle(s: Session = session): Promise<string> {
  const result = await s.client.callTool({
    name: "toggle-simulated-logging",
    arguments: {},
  });
  return textOf(contentOf(result)[0]);
}

describe("toggle-simulated-logging", () => {
  it("starts with one message at once, then one every five seconds", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(await toggle()).toBe(
      "Started simulated, random-leveled logging at a 5 second pace. Client's selected logging level will be respected. If an interval elapses and the message to be sent is below the selected level, it will not be sent. Thus at higher chosen logging levels, messages should arrive further apart.",
    );
    await vi.waitFor(() => expect(messages()).toHaveLength(1));
    expect(messages()[0]).toEqual({
      level: "emergency",
      data: "Emergency-level message",
    });

    await vi.advanceTimersByTimeAsync(10000);
    expect(messages()).toHaveLength(3);
  });

  it("picks the level at random across all eight levels", async () => {
    const levels = [];
    for (let i = 0; i < 8; i++) {
      vi.spyOn(Math, "random").mockReturnValue(i / 8);
      if (i === 0) await toggle();
      else await vi.advanceTimersByTimeAsync(5000);
      await vi.waitFor(() => expect(messages()).toHaveLength(i + 1));
      levels.push(messages()[i]);
    }
    expect(levels.map((m) => ({ level: m.level, data: m.data })))
      .toMatchInlineSnapshot(`
      [
        {
          "data": "Debug-level message",
          "level": "debug",
        },
        {
          "data": "Info-level message",
          "level": "info",
        },
        {
          "data": "Notice-level message",
          "level": "notice",
        },
        {
          "data": "Warning-level message",
          "level": "warning",
        },
        {
          "data": "Error-level message",
          "level": "error",
        },
        {
          "data": "Critical-level message",
          "level": "critical",
        },
        {
          "data": "Alert level-message",
          "level": "alert",
        },
        {
          "data": "Emergency-level message",
          "level": "emergency",
        },
      ]
    `);
  });

  it("stops when toggled again", async () => {
    await toggle();
    await vi.waitFor(() => expect(messages()).toHaveLength(1));
    expect(await toggle()).toBe("Stopped simulated logging");
    await vi.advanceTimersByTimeAsync(20000);
    expect(messages()).toHaveLength(1);
  });

  it("drops messages below the level the client set", async () => {
    await session.client.setLoggingLevel("error");
    vi.spyOn(Math, "random").mockReturnValue(0); // debug
    await toggle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(messages()).toEqual([]);

    vi.spyOn(Math, "random").mockReturnValue(0.7); // critical
    await vi.advanceTimersByTimeAsync(5000);
    expect(messages().map((m) => m.level)).toEqual(["critical"]);
  });

  it("is per session", async () => {
    const other = await connect();
    try {
      await toggle();
      await vi.advanceTimersByTimeAsync(5000);
      expect(messages()).toHaveLength(2);
      expect(messages(other)).toEqual([]);
    } finally {
      await other.close();
    }
  });

  it("is stopped by the session's cleanup", async () => {
    const leaving = await connect();
    await toggle(leaving);
    await vi.waitFor(() => expect(messages(leaving)).toHaveLength(1));
    // A closed client receives nothing either way, so check the server side:
    // an interval that outlived cleanup would log each failed send.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await leaving.close();
    await vi.advanceTimersByTimeAsync(20000);
    expect(messages(leaving)).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalledWith(
      "Simulated logging message failed:",
      expect.anything(),
    );
  });

  it("logs, rather than throws, a message that cannot be sent", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await toggle();
    await session.client.close();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        "Simulated logging message failed:",
        expect.any(Error),
      ),
    );
  });
});
