/**
 * Characterizes the HTTP+SSE transport manager (#4854). `createApp()` is
 * served on a free loopback port and driven by the SDK's SSE client, and by
 * raw HTTP for the requests a well-behaved client never sends. The launcher's
 * `startSseServer()` is checked with `listenOrExit` stubbed, so no fixed port
 * is ever bound.
 */
import type { Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { createApp } from "../transports/sse.js";

let http: Server;
let base: string;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  http = createApp().listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  if (address === null || typeof address === "string")
    throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  http.closeAllConnections();
  await new Promise((resolve) => http.close(resolve));
  vi.restoreAllMocks();
});

/** Connect an SSE client and return it with the session id the server logged. */
async function connectSse() {
  const client = new Client({ name: "sse-test", version: "0.0.0" });
  await client.connect(new SSEClientTransport(new URL(`${base}/sse`)));
  const connected = error.mock.calls.filter(
    (c: unknown[]) => c[0] === "Client Connected: ",
  );
  const sessionId = String(connected.at(-1)?.[1]);
  return { client, sessionId };
}

/** Whether `request` gets any response within `ms`. */
async function respondsWithin(url: string, init: RequestInit, ms = 300) {
  try {
    await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
    return true;
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") return false;
    throw e;
  }
}

describe("SSE transport", () => {
  it("serves the protocol: GET /sse opens the stream, POST /message carries requests", async () => {
    const { client, sessionId } = await connectSse();
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    const result = await client.callTool({
      name: "echo",
      arguments: { message: "over sse" },
    });
    expect(result.content).toEqual([{ type: "text", text: "Echo: over sse" }]);
    expect(error).toHaveBeenCalledWith("Client Message from", sessionId);
    await client.close();
  });

  it("gives each stream its own server and session", async () => {
    const a = await connectSse();
    const b = await connectSse();
    expect(a.sessionId).not.toBe(b.sessionId);
    const toggled = await a.client.callTool({
      name: "toggle-simulated-logging",
      arguments: {},
    });
    expect(JSON.stringify(toggled.content)).toContain(a.sessionId);
    await a.client.callTool({
      name: "toggle-simulated-logging",
      arguments: {},
    });
    await Promise.all([a.client.close(), b.client.close()]);
  });

  // KNOWN BUG #4981: POST /message for an unknown session is never answered; the fix changes this assertion.
  it("forgets the session and cleans up when the stream closes", async () => {
    const { client, sessionId } = await connectSse();
    await client.close();
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith("Client Disconnected: ", sessionId),
    );
    // A message for the closed session finds no transport and gets no answer.
    const answered = await respondsWithin(
      `${base}/message?sessionId=${sessionId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      },
    );
    expect(answered).toBe(false);
    expect(error).toHaveBeenCalledWith(
      `No transport found for sessionId ${sessionId}`,
    );
  });

  // KNOWN BUG #4981: POST /message for an unknown session is never answered; the fix changes this assertion.
  it("never answers a POST for an unknown session", async () => {
    expect(
      await respondsWithin(`${base}/message?sessionId=nope`, {
        method: "POST",
        body: "{}",
      }),
    ).toBe(false);
    expect(error).toHaveBeenCalledWith("No transport found for sessionId nope");
  });

  // KNOWN BUG #4981: a second GET /sse for an existing session is never answered; the fix changes this assertion.
  it("never answers a second GET /sse for an existing session, and only logs it", async () => {
    const { client, sessionId } = await connectSse();
    expect(await respondsWithin(`${base}/sse?sessionId=${sessionId}`, {})).toBe(
      false,
    );
    expect(error).toHaveBeenCalledWith(
      "Client Reconnecting? This shouldn't happen; when client has a sessionId, GET /sse should not be called again.",
      sessionId,
    );
    await client.close();
  });

  // KNOWN BUG #4981: GET /sse?sessionId=<unknown> throws a TypeError that surfaces as a 500; the fix changes this assertion.
  it("fails a GET /sse for an unknown session id with a 500", async () => {
    // Characterization: the reconnect branch reads `.sessionId` of a missing
    // transport, and Express turns the TypeError into a 500.
    const response = await fetch(`${base}/sse?sessionId=unknown`);
    expect(response.status).toBe(500);
  });

  it("answers a CORS preflight for any origin", async () => {
    const response = await fetch(`${base}/message`, {
      method: "OPTIONS",
      headers: {
        origin: "http://elsewhere.example",
        "access-control-request-method": "POST",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET,POST",
    );
  });
});

describe("startSseServer", () => {
  afterEach(() => {
    vi.doUnmock("../transports/listen.js");
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function start() {
    vi.resetModules();
    const listenOrExit = vi.fn(() => "the http server");
    vi.doMock("../transports/listen.js", () => ({ listenOrExit }));
    const { startSseServer } = await import("../transports/sse.js");
    return { listenOrExit, server: startSseServer() };
  }

  it("binds PORT when it is set", async () => {
    vi.stubEnv("PORT", "4567");
    const { listenOrExit, server } = await start();
    expect(error).toHaveBeenCalledWith("Starting SSE server...");
    expect(listenOrExit).toHaveBeenCalledWith(
      expect.any(Function),
      "4567",
      "Server is running on port 4567",
    );
    expect(server).toBe("the http server");
  });

  it("binds 3001 by default", async () => {
    vi.stubEnv("PORT", "");
    const { listenOrExit } = await start();
    expect(listenOrExit).toHaveBeenCalledWith(
      expect.any(Function),
      3001,
      "Server is running on port 3001",
    );
  });
});
