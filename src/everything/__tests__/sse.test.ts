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

  it("forgets the session and cleans up when the stream closes", async () => {
    const { client, sessionId } = await connectSse();
    await client.close();
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith("Client Disconnected: ", sessionId),
    );
    // A message for the closed session finds no transport and is answered 404.
    const response = await fetch(`${base}/message?sessionId=${sessionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      signal: AbortSignal.timeout(2000),
    });
    expect(response.status).toBe(404);
    expect(error).toHaveBeenCalledWith(
      `No transport found for sessionId ${sessionId}`,
    );
  });

  it("answers a POST for an unknown session with a 404", async () => {
    const response = await fetch(`${base}/message?sessionId=nope`, {
      method: "POST",
      body: "{}",
      signal: AbortSignal.timeout(2000),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Session not found" },
      id: null,
    });
    expect(error).toHaveBeenCalledWith("No transport found for sessionId nope");
  });

  it("answers a POST with no session id with a 400", async () => {
    const response = await fetch(`${base}/message`, {
      method: "POST",
      body: "{}",
      signal: AbortSignal.timeout(2000),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: sessionId query parameter is required",
      },
      id: null,
    });
  });

  it("answers a second GET /sse for an existing session with a 409, and keeps the first stream", async () => {
    const { client, sessionId } = await connectSse();
    const response = await fetch(`${base}/sse?sessionId=${sessionId}`, {
      signal: AbortSignal.timeout(2000),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Conflict: this session already has an SSE stream",
      },
      id: null,
    });
    expect(error).toHaveBeenCalledWith(
      "Client Reconnecting? This shouldn't happen; when client has a sessionId, GET /sse should not be called again.",
      sessionId,
    );
    // The original session is untouched and still serves requests.
    const result = await client.callTool({
      name: "echo",
      arguments: { message: "still here" },
    });
    expect(result.content).toEqual([
      { type: "text", text: "Echo: still here" },
    ]);
    await client.close();
  });

  it("answers a GET /sse for an unknown session id with a 404", async () => {
    const response = await fetch(`${base}/sse?sessionId=unknown`, {
      signal: AbortSignal.timeout(2000),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Session not found" },
      id: null,
    });
    expect(error).toHaveBeenCalledWith(
      "No transport found for sessionId unknown",
    );
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
