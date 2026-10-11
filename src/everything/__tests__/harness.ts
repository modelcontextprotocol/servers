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
 * Several server modules keep per-session state in module-level maps keyed by
 * the transport's session id (logging, subscriptions, roots, the toggles).
 * `InMemoryTransport` has no session id of its own, so every in-memory session
 * would share the `undefined` key and leak state between tests. `connect()`
 * therefore gives each server transport a fresh `sessionId` before `connect`
 * (pass `sessionId: null` to keep it undefined, as stdio does), and `close()`
 * runs the server's `cleanup(sessionId)` the way the HTTP transports do.
 */
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { TaskStore } from "@modelcontextprotocol/sdk/experimental/tasks";
import type {
  ClientCapabilities,
  ContentBlock,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../server/index.js";

/** Options for one in-process session. */
export type ConnectOptions = {
  /** The capabilities the client declares in `initialize`. */
  capabilities?: ClientCapabilities;
  /** A client-side task store, for servers that send task-augmented requests. */
  taskStore?: TaskStore;
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
    {
      capabilities: options.capabilities ?? {},
      ...(options.taskStore ? { taskStore: options.taskStore } : {}),
    },
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
      cleanup(sessionId);
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
  tasks: {
    requests: {
      sampling: { createMessage: {} },
      elicitation: { create: {} },
    },
  },
};
