/**
 * The in-process protocol harness for the everything-server suite (#4854).
 *
 * Every protocol-level test links a real SDK `Client` to a real server from
 * `createServer()` over `InMemoryTransport`, and asserts only on what crosses
 * the wire: results, errors, notifications and the requests the server sends
 * back to the client. Nothing here reaches into SDK internals or handler
 * `extra` objects, so the SDK v2 codemod can update these tests with import
 * and type changes alone.
 *
 * `connect()` serves a 2025-era client: the server is connected to the
 * transport directly and the client opens with `initialize`. Per-connection
 * state lives on the server instance (#4852), so each session is isolated by
 * construction; `close()` runs the server's `cleanup()` the way the
 * transports do when a connection ends. The transport still gets a session id
 * (pass `sessionId: null` to leave it undefined, as stdio does), for the tests
 * that look at one.
 *
 * `connectModern()` serves a 2026-07-28 client: it hands the factory to the
 * SDK's `serveStdio` entry over the in-memory pair, as the stdio transport
 * does, and the client negotiates the era with `server/discover`, so every
 * request carries its capabilities in `_meta`.
 */
import { randomUUID } from "node:crypto";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type {
  ClientCapabilities,
  ContentBlock,
  ServerNotification,
} from "@modelcontextprotocol/client";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "../server/index.js";

/** Options for one in-process session. */
export type ConnectOptions = {
  /** The capabilities the client declares in `initialize`. */
  capabilities?: ClientCapabilities;
  /** Install request handlers on the client before it connects. */
  setup?: (client: Client) => void;
  /** The server transport's session id; `null` leaves it undefined. */
  sessionId?: string | null;
};

/** A connected client, what it has been sent, and how to end the session. */
export type Session = {
  client: Client;
  sessionId: string | undefined;
  /** Every notification the server sent that no specific handler consumed. */
  notifications: ServerNotification[];
  /** Close the client and run the server's cleanup for this session. */
  close: () => Promise<void>;
};

/** Connect a fresh client to a fresh server over an in-memory transport. */
export async function connect(options: ConnectOptions = {}): Promise<Session> {
  const { server, cleanup } = createServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const sessionId =
    options.sessionId === null
      ? undefined
      : (options.sessionId ?? randomUUID());
  serverTransport.sessionId = sessionId;

  const client = new Client(
    { name: "everything-test-client", version: "0.0.0" },
    { capabilities: options.capabilities ?? {} },
  );
  const notifications: ServerNotification[] = [];
  client.fallbackNotificationHandler = async (notification) => {
    notifications.push(notification as ServerNotification);
  };
  options.setup?.(client);

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    client,
    sessionId,
    notifications,
    close: async () => {
      await client.close();
      cleanup();
    },
  };
}

/** Options for one in-process 2026-07-28 session. */
export type ModernConnectOptions = {
  /** The capabilities the client declares with each request. */
  capabilities?: ClientCapabilities;
  /** Install request handlers on the client before it connects. */
  setup?: (client: Client) => void;
};

/**
 * Connect a fresh 2026-07-28 client to a server built for the modern era,
 * served the way the stdio transport serves it.
 */
export async function connectModern(
  options: ModernConnectOptions = {},
): Promise<Session> {
  const cleanups: Array<() => void> = [];
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const handle = serveStdio(
    ({ era }) => {
      const { server, cleanup } = createServer({ era });
      cleanups.push(cleanup);
      return server;
    },
    { transport: serverTransport },
  );

  const client = new Client(
    { name: "everything-test-client", version: "0.0.0" },
    {
      capabilities: options.capabilities ?? {},
      versionNegotiation: { mode: { pin: "2026-07-28" } },
    },
  );
  const notifications: ServerNotification[] = [];
  client.fallbackNotificationHandler = async (notification) => {
    notifications.push(notification as ServerNotification);
  };
  options.setup?.(client);
  await client.connect(clientTransport);

  return {
    client,
    sessionId: undefined,
    notifications,
    close: async () => {
      await client.close();
      await handle.close();
      for (const cleanup of cleanups) cleanup();
    },
  };
}

/** The notifications in `notifications` with the given method. */
export function ofMethod<M extends ServerNotification["method"]>(
  notifications: ServerNotification[],
  method: M,
): Extract<ServerNotification, { method: M }>[] {
  return notifications.filter(
    (n): n is Extract<ServerNotification, { method: M }> => n.method === method,
  );
}

/**
 * Narrow a content block to the member of the `ContentBlock` union whose
 * `type` is `type`, throwing if the block is missing or of another kind.
 */
export function contentOfType<T extends ContentBlock["type"]>(
  block: ContentBlock | undefined,
  type: T,
): Extract<ContentBlock, { type: T }> {
  if (block?.type !== type) {
    throw new Error(`expected ${type} content, got ${block?.type}`);
  }
  return block as Extract<ContentBlock, { type: T }>;
}

/** The text of a content block that must be a text block. */
export function textOf(block: unknown): string {
  return contentOfType(block as ContentBlock | undefined, "text").text;
}

/** The content blocks of a `tools/call` result. */
export function contentOf(result: object): ContentBlock[] {
  return ("content" in result ? result.content : []) as ContentBlock[];
}

/** Every client capability the server gates a tool on. */
export const ALL_CAPABILITIES: ClientCapabilities = {
  roots: { listChanged: true },
  sampling: {},
  elicitation: { form: {}, url: {} },
};

/** Every client capability, plus the tasks extension (2026-07-28). */
export const MODERN_CAPABILITIES: ClientCapabilities = {
  ...ALL_CAPABILITIES,
  extensions: { "io.modelcontextprotocol/tasks": {} },
};
