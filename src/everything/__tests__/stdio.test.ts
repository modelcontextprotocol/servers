/**
 * Characterizes the stdio transport manager (#4854) in-process: `main()` is
 * given a pair of in-memory streams in place of the process's stdin and
 * stdout, and a real client talks newline-delimited JSON-RPC over them, as a
 * client does over a spawned server's pipes. The SIGINT handler it installs
 * is called directly, with `process.exit` stubbed.
 */
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { Client } from "@modelcontextprotocol/client";
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

  it("serves a 2026-07-28 client on the same pipes (#4852)", async () => {
    const toServer = new PassThrough();
    const fromServer = new PassThrough();
    const stdio = await main(toServer, fromServer);
    started.push(stdio);
    const client = new Client(
      { name: "stdio-test", version: "0.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    await client.connect(new StdioServerTransport(fromServer, toServer));
    expect(client.getProtocolEra()).toBe("modern");
    expect(client.getServerCapabilities()?.extensions).toEqual({
      "io.modelcontextprotocol/tasks": {},
    });
    const result = await client.callTool({
      name: "echo",
      arguments: { message: "modern" },
    });
    expect(result.content).toEqual([{ type: "text", text: "Echo: modern" }]);
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

  it("reports a transport that cannot start on stderr and in the exit status", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = new PassThrough();
    broken.on = () => {
      throw new Error("stdin unavailable");
    };
    const before = process.listeners("SIGINT").length;
    await startStdioServer(broken, new PassThrough());
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        "Transport error:",
        expect.objectContaining({ message: "stdin unavailable" }),
      ),
    );
    // The failure is in the exit status too; reset it so the run is not failed.
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    for (const listener of process.listeners("SIGINT").slice(before)) {
      process.off("SIGINT", listener);
    }
  });
});
