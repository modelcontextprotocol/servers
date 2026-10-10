/**
 * Characterizes the stdio transport manager (#4854) in-process: `main()` is
 * given a pair of in-memory streams in place of the process's stdin and
 * stdout, and a real client talks newline-delimited JSON-RPC over them, as a
 * client does over a spawned server's pipes. The SIGINT handler it installs
 * is called directly, with `process.exit` stubbed.
 */
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  main,
  startStdioServer,
  type StdioSession,
} from "../transports/stdio.js";

const started: StdioSession[] = [];

afterEach(() => {
  for (const { shutdown } of started.splice(0)) {
    process.off("SIGINT", shutdown);
  }
  vi.restoreAllMocks();
});

/**
 * Start the server on in-memory pipes and connect a client to the other
 * ends. The client side reuses the SDK's stdio framing, reading the server's
 * stdout and writing its stdin.
 */
async function startOnPipes() {
  const toServer = new PassThrough();
  const fromServer = new PassThrough();
  const stdio = await main(toServer, fromServer);
  started.push(stdio);
  const client = new Client({ name: "stdio-test", version: "0.0.0" });
  await client.connect(new StdioServerTransport(fromServer, toServer));
  return { client, stdio };
}

describe("stdio transport", () => {
  it("serves the protocol over the given streams", async () => {
    const { client } = await startOnPipes();
    expect(client.getServerVersion()?.name).toBe("mcp-servers/everything");
    const result = await client.callTool({
      name: "echo",
      arguments: { message: "over stdio" },
    });
    expect(result.content).toEqual([
      { type: "text", text: "Echo: over stdio" },
    ]);
    await client.close();
  });

  it("gives the session no id, so per-session output names none", async () => {
    const { client } = await startOnPipes();
    const result = await client.callTool({
      name: "toggle-subscriber-updates",
      arguments: {},
    });
    expect(result.content).toEqual([
      {
        type: "text",
        text: "Started simulated resource updated notifications for session undefined at a 5 second pace. Client will receive updates for any resources the it is subscribed to.",
      },
    ]);
    await client.callTool({ name: "toggle-subscriber-updates", arguments: {} });
    await client.close();
  });

  it("closes the server, cleans up and exits 0 on SIGINT", async () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const { client, stdio } = await startOnPipes();
    expect(process.listeners("SIGINT")).toContain(stdio.shutdown);

    const closed = new Promise<void>((resolve) => {
      client.onclose = resolve;
    });
    await stdio.shutdown();
    expect(exit).toHaveBeenCalledWith(0);
    // The server closing its transport does not end the client's side of the
    // pipes; the client sees its own close.
    await client.close();
    await closed;
  });

  it("announces itself on stderr and starts main", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = process.listeners("SIGINT").length;
    await startStdioServer(new PassThrough(), new PassThrough());
    expect(error).toHaveBeenCalledWith("Starting default (STDIO) server...");
    const added = process.listeners("SIGINT").slice(before);
    expect(added).toHaveLength(1);
    for (const listener of added) process.off("SIGINT", listener);
  });

  it("reports a failure to start and exits 1", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const broken = new PassThrough();
    broken.on = () => {
      throw new Error("stdin unavailable");
    };
    await startStdioServer(broken, new PassThrough());
    expect(error).toHaveBeenCalledWith("Server error:", expect.any(Error));
    expect(exit).toHaveBeenCalledWith(1);
  });
});
