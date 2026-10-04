/**
 * Characterizes the Streamable HTTP transport manager (#4854). `createApp()`
 * is served on a free loopback port and driven by the SDK's Streamable HTTP
 * client, and by raw HTTP where the test pins the wire itself: the 400s for
 * missing or unknown sessions, the priming event on each SSE stream (#3267),
 * and the event store's replay of events from other streams (#4087). The
 * shutdown handler is called directly, and `startStreamableHttpServer()` is
 * checked with `listenOrExit` stubbed, so no fixed port is ever bound.
 */
import type { Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  createApp,
  type StreamableHttpApp,
} from "../transports/streamableHttp.js";

let app: StreamableHttpApp;
let http: Server;
let mcp: string;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  app = createApp();
  http = app.app.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  if (address === null || typeof address === "string")
    throw new Error("no port");
  mcp = `http://127.0.0.1:${address.port}/mcp`;
});

afterEach(async () => {
  http.closeAllConnections();
  await new Promise((resolve) => http.close(resolve));
  vi.restoreAllMocks();
});

async function connectHttp() {
  const transport = new StreamableHTTPClientTransport(new URL(mcp));
  const client = new Client({ name: "http-test", version: "0.0.0" });
  await client.connect(transport);
  return { client, transport, sessionId: transport.sessionId! };
}

const JSON_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

const BAD_SESSION = {
  jsonrpc: "2.0",
  error: { code: -32000, message: "Bad Request: No valid session ID provided" },
};

type SseEvent = { id?: string; data: string };

/** Parse a complete SSE body into its events. */
function parseSse(body: string): SseEvent[] {
  return body
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => {
      const event: SseEvent = { data: "" };
      for (const line of block.split("\n")) {
        if (line.startsWith("id: ")) event.id = line.slice(4);
        if (line.startsWith("data: ")) event.data += line.slice(6);
      }
      return event;
    });
}

/** POST one JSON-RPC message, raw. */
async function post(message: object, sessionId?: string) {
  return fetch(mcp, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      ...(sessionId
        ? { "mcp-session-id": sessionId, "mcp-protocol-version": "2025-11-25" }
        : {}),
    },
    body: JSON.stringify(message),
  });
}

/** Initialize a session over raw HTTP; returns its id and the init events. */
async function rawInitialize() {
  const response = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "raw", version: "0" },
    },
  });
  const sessionId = response.headers.get("mcp-session-id")!;
  const events = parseSse(await response.text());
  const initialized = await post(
    { jsonrpc: "2.0", method: "notifications/initialized" },
    sessionId,
  );
  expect(initialized.status).toBe(202);
  return { sessionId, events };
}

/** Read an open SSE response until `done(text)` holds, then abort it. */
async function readUntil(
  response: Response,
  done: (text: string) => boolean,
  controller: AbortController,
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 2000;
  while (!done(text) && Date.now() < deadline) {
    const { value, done: ended } = await reader.read();
    if (ended) break;
    text += decoder.decode(value);
  }
  controller.abort();
  return text;
}

describe("Streamable HTTP transport", () => {
  it("serves the protocol to the SDK client over one session", async () => {
    const { client, sessionId } = await connectHttp();
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    const result = await client.callTool({
      name: "echo",
      arguments: { message: "over http" },
    });
    expect(result.content).toEqual([{ type: "text", text: "Echo: over http" }]);
    expect(log).toHaveBeenCalledWith(
      `Session initialized with ID: ${sessionId}`,
    );
    await client.close();
  });

  it("starts each SSE response with an empty priming event (#3267)", async () => {
    // SDK behavior required by SEP-1699 for a 2025-11-25 client when an event
    // store is configured: an event with an id and no data comes first.
    const { events } = await rawInitialize();
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ id: expect.any(String), data: "" });
    expect(JSON.parse(events[1].data)).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "mcp-servers/everything" } },
    });
  });

  it("replays events from other streams after a Last-Event-ID (#4087)", async () => {
    // Characterization of #4087: the in-memory event store replays every
    // event stored after the given one, whatever stream it belongs to, so a
    // GET resuming the initialize stream receives a later tool result.
    const { sessionId, events } = await rawInitialize();
    const echo = await post(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "echo", arguments: { message: "from another stream" } },
      },
      sessionId,
    );
    await echo.text();

    const controller = new AbortController();
    const resumed = await fetch(mcp, {
      headers: {
        accept: "text/event-stream",
        "mcp-session-id": sessionId,
        "mcp-protocol-version": "2025-11-25",
        "last-event-id": events[1].id!,
      },
      signal: controller.signal,
    });
    expect(resumed.status).toBe(200);
    const text = await readUntil(
      resumed,
      (t) => t.includes("from another stream"),
      controller,
    );
    expect(text).toContain("Echo: from another stream");
    expect(log).toHaveBeenCalledWith(
      `Client reconnecting with Last-Event-ID: ${events[1].id}`,
    );
  });

  it("opens a standalone SSE stream, replaying nothing for an unknown Last-Event-ID", async () => {
    const { sessionId } = await rawInitialize();
    const controller = new AbortController();
    const response = await fetch(mcp, {
      headers: {
        accept: "text/event-stream",
        "mcp-session-id": sessionId,
        "mcp-protocol-version": "2025-11-25",
        "last-event-id": "no-such-event",
      },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    controller.abort();
  });

  it("opens a standalone SSE stream without a Last-Event-ID", async () => {
    const { sessionId } = await rawInitialize();
    const controller = new AbortController();
    const response = await fetch(mcp, {
      headers: {
        accept: "text/event-stream",
        "mcp-session-id": sessionId,
        "mcp-protocol-version": "2025-11-25",
      },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(log).toHaveBeenCalledWith(
      `Establishing new SSE stream for session ${sessionId}`,
    );
    controller.abort();
  });

  it.each(["GET", "DELETE"])(
    "answers %s with no session id with a 400",
    async (method) => {
      const response = await fetch(mcp, { method });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(BAD_SESSION);
    },
  );

  it.each(["GET", "DELETE"])(
    "answers %s for an unknown session with a 400",
    async (method) => {
      const response = await fetch(mcp, {
        method,
        headers: { "mcp-session-id": "unknown" },
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(BAD_SESSION);
    },
  );

  it("answers a POST for an unknown session with a 400 that omits the request id", async () => {
    // Characterization: no body parser runs before this check, so
    // `req.body` is undefined and the error carries no `id`.
    const response = await post(
      { jsonrpc: "2.0", id: 7, method: "ping" },
      "unknown",
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(BAD_SESSION);
  });

  it("creates a server for a session-less POST that is not initialize, which the SDK then rejects", async () => {
    const response = await post({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: Server not initialized" },
    });
  });

  it("ends a session on DELETE, cleaning it up and refusing it afterwards", async () => {
    const { client, transport, sessionId } = await connectHttp();
    await transport.terminateSession();
    expect(log).toHaveBeenCalledWith(
      `Received session termination request for session ${sessionId}`,
    );
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith(
        `Transport closed for session ${sessionId}, removing from transports map`,
      ),
    );
    const after = await post(
      { jsonrpc: "2.0", id: 9, method: "ping" },
      sessionId,
    );
    expect(after.status).toBe(400);
    await client.close();
  });

  it("maps a POST that throws before answering to a JSON-RPC internal error", async () => {
    vi.spyOn(
      StreamableHTTPServerTransport.prototype,
      "handleRequest",
    ).mockRejectedValueOnce(new Error("boom"));
    const response = await post({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error" },
    });
    expect(log).toHaveBeenCalledWith(
      "Error handling MCP request:",
      expect.any(Error),
    );
  });

  it("leaves a POST alone when it throws after answering", async () => {
    const { sessionId } = await rawInitialize();
    vi.spyOn(
      StreamableHTTPServerTransport.prototype,
      "handleRequest",
    ).mockImplementationOnce(async (_req, res) => {
      res.writeHead(200).end("partial");
      throw new Error("late");
    });
    const response = await post(
      { jsonrpc: "2.0", id: 3, method: "ping" },
      sessionId,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("partial");
  });

  it("maps a DELETE that throws to a JSON-RPC internal error, unless it already answered", async () => {
    const { sessionId } = await rawInitialize();
    const handle = vi.spyOn(
      StreamableHTTPServerTransport.prototype,
      "handleRequest",
    );
    handle.mockRejectedValueOnce(new Error("boom"));
    const failed = await fetch(mcp, {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId },
    });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Error handling session termination" },
    });

    handle.mockImplementationOnce(async (_req, res) => {
      res.writeHead(200).end("partial");
      throw new Error("late");
    });
    const partial = await fetch(mcp, {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId },
    });
    expect(await partial.text()).toBe("partial");
    expect(log).toHaveBeenCalledWith(
      "Error handling session termination:",
      expect.any(Error),
    );
  });

  it("answers a CORS preflight for any origin and exposes the MCP headers", async () => {
    const response = await fetch(mcp, {
      method: "OPTIONS",
      headers: {
        origin: "http://elsewhere.example",
        "access-control-request-method": "DELETE",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET,POST,DELETE",
    );
  });
});

describe("shutdown", () => {
  it("logs and exits 0 without closing any session", async () => {
    // Characterization: the handler walks the session Map with `for...in`,
    // which visits no entries, so no transport is closed (#4854 baseline).
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const { client } = await connectHttp();
    await app.shutdown();
    expect(log).toHaveBeenCalledWith("Shutting down server...");
    expect(log).toHaveBeenCalledWith("Server shutdown complete");
    expect(log).not.toHaveBeenCalledWith(
      expect.stringMatching(/^Closing transport for session/),
    );
    expect(exit).toHaveBeenCalledWith(0);
    // The session still works.
    const result = await client.callTool({
      name: "echo",
      arguments: { message: "still here" },
    });
    expect(result.content).toEqual([
      { type: "text", text: "Echo: still here" },
    ]);
    await client.close();
  });
});

describe("startStreamableHttpServer", () => {
  afterEach(() => {
    vi.doUnmock("../transports/listen.js");
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function start() {
    vi.resetModules();
    const listenOrExit = vi.fn(() => "the http server");
    vi.doMock("../transports/listen.js", () => ({ listenOrExit }));
    const { startStreamableHttpServer } =
      await import("../transports/streamableHttp.js");
    const before = process.listeners("SIGINT").length;
    const server = startStreamableHttpServer();
    const added = process.listeners("SIGINT").slice(before);
    for (const listener of added) process.off("SIGINT", listener);
    return { listenOrExit, server, added };
  }

  it("binds PORT when it is set and installs the shutdown handler for SIGINT", async () => {
    vi.stubEnv("PORT", "4568");
    const { listenOrExit, server, added } = await start();
    expect(log).toHaveBeenCalledWith("Starting Streamable HTTP server...");
    expect(listenOrExit).toHaveBeenCalledWith(
      expect.any(Function),
      "4568",
      "MCP Streamable HTTP Server listening on port 4568",
    );
    expect(server).toBe("the http server");
    expect(added).toHaveLength(1);
  });

  it("binds 3001 by default", async () => {
    vi.stubEnv("PORT", "");
    const { listenOrExit } = await start();
    expect(listenOrExit).toHaveBeenCalledWith(
      expect.any(Function),
      3001,
      "MCP Streamable HTTP Server listening on port 3001",
    );
  });
});
