/**
 * Characterizes the HTTP+SSE transport manager (#4854). `createApp()` is
 * served on a free loopback port and driven by the SDK's SSE client, and by
 * raw HTTP for the requests a well-behaved client never sends. The launcher's
 * `startSseServer()` is checked with `listenOrExit` stubbed, so no fixed port
 * is ever bound.
 *
 * A browser request is served only from a localhost origin: the tests pin
 * that a foreign `Origin` is refused with a 403 and no CORS grant at every
 * route, preflights included, and that a localhost one is served.
 */
import type { Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client, SSEClientTransport } from "@modelcontextprotocol/client";
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
    // Each stream's server keeps its own toggle state: turning logging on
    // for one leaves the other's off.
    const toggle = async (client: typeof a.client) =>
      JSON.stringify(
        (
          await client.callTool({
            name: "toggle-simulated-logging",
            arguments: {},
          })
        ).content,
      );
    expect(await toggle(a.client)).toContain("Started");
    expect(await toggle(b.client)).toContain("Started");
    expect(await toggle(a.client)).toContain("Stopped");
    expect(await toggle(b.client)).toContain("Stopped");
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

  it("answers a CORS preflight from a localhost origin, echoing that origin", async () => {
    const response = await fetch(`${base}/message`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:6274",
        "access-control-request-method": "POST",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:6274",
    );
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET,POST",
    );
  });

  it("serves a client whose requests carry a localhost Origin", async () => {
    const client = new Client({ name: "sse-test", version: "0.0.0" });
    // Every request the transport makes, the stream's GET included, carries
    // the Origin a browser page served from localhost would send.
    const withOrigin = (url: string | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("origin", "http://127.0.0.1:6274");
      return fetch(url, { ...init, headers });
    };
    await client.connect(
      new SSEClientTransport(new URL(`${base}/sse`), { fetch: withOrigin }),
    );
    const result = await client.callTool({
      name: "echo",
      arguments: { message: "from localhost" },
    });
    expect(result.content).toEqual([
      { type: "text", text: "Echo: from localhost" },
    ]);
    await client.close();
  });

  describe("a request from a foreign origin", () => {
    const FOREIGN = "http://elsewhere.example";

    it("is refused at preflight, with no CORS grant", async () => {
      const response = await fetch(`${base}/message`, {
        method: "OPTIONS",
        headers: {
          origin: FOREIGN,
          "access-control-request-method": "POST",
        },
      });
      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("cannot open an SSE stream", async () => {
      const response = await fetch(`${base}/sse`, {
        headers: { origin: FOREIGN },
        signal: AbortSignal.timeout(2000),
      });
      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(error).not.toHaveBeenCalledWith(
        "Client Connected: ",
        expect.anything(),
      );
    });

    it("cannot call a tool on an open session", async () => {
      const { client, sessionId } = await connectSse();
      const messages = () =>
        error.mock.calls.filter(
          (c: unknown[]) => c[0] === "Client Message from",
        ).length;
      const before = messages();
      const response = await fetch(`${base}/message?sessionId=${sessionId}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: FOREIGN },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "get-env", arguments: {} },
        }),
        signal: AbortSignal.timeout(2000),
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32000 },
        id: null,
      });
      // The refused message never reached the session's transport.
      expect(messages()).toBe(before);
      await client.close();
    });
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
