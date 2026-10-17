// Shared harness for the in-process protocol tests (#4854). It links a real
// SDK Client to a server built by `createServer()` over an InMemoryTransport,
// so every test goes through the SDK's input validation, output-schema
// validation and error mapping exactly as a client on the wire would, with no
// process and no build. Tests use only the public Client API and the wire
// shapes it returns, so the Part 3 SDK migration can update them with import
// and type changes alone.

import { expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../index.js";

export const TOOL_NAME = "sequentialthinking";

/** The JSON payload of a successful call, as both text and structuredContent. */
export interface ThoughtResult {
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  branches: string[];
  thoughtHistoryLength: number;
}

/** A tool result as the client sees it on the wire. */
export interface WireResult {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface Connected {
  client: Client;
  /** Call the tool with raw (unvalidated) arguments, as a client would. */
  think: (args: Record<string, unknown>) => Promise<WireResult>;
  close: () => Promise<void>;
}

export interface ConnectOptions {
  /**
   * The DISABLE_THOUGHT_LOGGING value the server is constructed under
   * (`undefined` = unset). It is read once, when the server is built, so it is
   * set only around `createServer()` and restored at once. Defaults to "true",
   * which keeps the per-thought box off stderr in tests not about logging.
   */
  disableThoughtLogging?: string | undefined;
}

/** Build a fresh server and connect a client to it in-process. */
export async function connect(
  options: ConnectOptions = { disableThoughtLogging: "true" },
): Promise<Connected> {
  const previous = process.env.DISABLE_THOUGHT_LOGGING;
  setEnv(options.disableThoughtLogging);
  let server: ReturnType<typeof createServer>;
  try {
    server = createServer();
  } finally {
    setEnv(previous);
  }
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    think: async (args) =>
      (await client.callTool({
        name: TOOL_NAME,
        arguments: args,
      })) as WireResult,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** The text of a result's single content block. */
export function textOf(result: WireResult): string {
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe("text");
  return result.content[0].text ?? "";
}

/** Parse a successful result, checking text and structuredContent agree. */
export function parseOk(result: WireResult): ThoughtResult {
  expect(result.isError).toBeFalsy();
  const parsed = JSON.parse(textOf(result)) as ThoughtResult;
  expect(result.structuredContent).toEqual(parsed);
  return parsed;
}

/** Minimal valid arguments, overridable per test. */
export function thought(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    thought: "a thought",
    nextThoughtNeeded: true,
    thoughtNumber: 1,
    totalThoughts: 3,
    ...overrides,
  };
}

function setEnv(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.DISABLE_THOUGHT_LOGGING;
  } else {
    process.env.DISABLE_THOUGHT_LOGGING = value;
  }
}
