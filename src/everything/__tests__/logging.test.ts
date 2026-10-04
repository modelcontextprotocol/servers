/**
 * Characterizes the simulated logging that `toggle-simulated-logging` drives
 * (#4854): a random-leveled `notifications/message` at once and then every
 * five seconds, filtered by the level the client set with `logging/setLevel`,
 * per session, until toggled off or the session is cleaned up.
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
      `Started simulated, random-leveled logging for session ${session.sessionId} at a 5 second pace. Client's selected logging level will be respected. If an interval elapses and the message to be sent is below the selected level, it will not be sent. Thus at higher chosen logging levels, messages should arrive further apart. `,
    );
    await vi.waitFor(() => expect(messages()).toHaveLength(1));
    expect(messages()[0]).toEqual({
      level: "emergency",
      data: `Emergency-level message - SessionId ${session.sessionId}`,
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
    expect(
      levels.map((m) => ({
        level: m.level,
        data: String(m.data).replace(session.sessionId ?? "", "<session>"),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "data": "Debug-level message - SessionId <session>",
          "level": "debug",
        },
        {
          "data": "Info-level message - SessionId <session>",
          "level": "info",
        },
        {
          "data": "Notice-level message - SessionId <session>",
          "level": "notice",
        },
        {
          "data": "Warning-level message - SessionId <session>",
          "level": "warning",
        },
        {
          "data": "Error-level message - SessionId <session>",
          "level": "error",
        },
        {
          "data": "Critical-level message - SessionId <session>",
          "level": "critical",
        },
        {
          "data": "Alert level-message - SessionId <session>",
          "level": "alert",
        },
        {
          "data": "Emergency-level message - SessionId <session>",
          "level": "emergency",
        },
      ]
    `);
  });

  it("stops when toggled again", async () => {
    await toggle();
    await vi.waitFor(() => expect(messages()).toHaveLength(1));
    expect(await toggle()).toBe(
      `Stopped simulated logging for session ${session.sessionId}`,
    );
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

  it("names no session when there is none (stdio)", async () => {
    await session.close();
    session = await connect({ sessionId: null });
    vi.spyOn(Math, "random").mockReturnValue(0.2); // info
    expect(await toggle()).toMatch(
      /^Started simulated, random-leveled logging for session undefined /,
    );
    await vi.waitFor(() => expect(messages()).toHaveLength(1));
    expect(messages()[0]).toEqual({
      level: "info",
      data: "Info-level message",
    });
    expect(await toggle()).toBe(
      "Stopped simulated logging for session undefined",
    );
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
    await leaving.close();
    await vi.advanceTimersByTimeAsync(20000);
    expect(messages(leaving)).toHaveLength(1);
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
