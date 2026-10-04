// `listenOrExit` is what stops an HTTP transport from reporting a port it does
// not hold (#4923: SSE printed "Server is running" on a port another process
// had, and stayed up listening on nothing). These tests bind real sockets,
// because the defect lived in how Express hands a real listen error to the
// success callback; a mocked `listen` would not have reproduced it.
// `process.exit` is replaced so the failure path can be observed without ending
// the test run, and `console.error` is silenced because that path prints.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import express from "express";
import { listenOrExit } from "../transports/listen.js";

const LISTENING = "listening line";

describe("listenOrExit", () => {
  let servers: Server[];
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exited: Promise<number | undefined>;

  beforeEach(() => {
    servers = [];
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exited = new Promise((resolve) => {
      vi.spyOn(process, "exit").mockImplementation((code) => {
        resolve(typeof code === "number" ? code : undefined);
        return undefined as never;
      });
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      servers
        .filter((server) => server.listening)
        .map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve())),
        ),
    );
  });

  /** A server holding a port, and the port it holds. */
  async function holdPort(): Promise<number> {
    const holder = createServer();
    servers.push(holder);
    // No host, as the transports bind: a holder on 127.0.0.1 alone would not
    // conflict with their wildcard bind on every platform.
    holder.listen(0);
    await once(holder, "listening");
    const address = holder.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a TCP address");
    }
    return address.port;
  }

  it("prints the listening line once the port is bound, and does not exit", async () => {
    const server = listenOrExit(express(), 0, LISTENING);
    servers.push(server);
    await once(server, "listening");

    expect(server.listening).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(LISTENING);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("reports a port already in use and exits 1 without claiming to listen", async () => {
    const port = await holdPort();
    const server = listenOrExit(express(), port, LISTENING);
    servers.push(server);

    expect(await exited).toBe(1);
    expect(server.listening).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      `Failed to start: Port ${port} is already in use. Set PORT to a free port or stop the conflicting process.`,
    );
    expect(errorSpy).not.toHaveBeenCalledWith(LISTENING);
  });

  it("reports an error that is not an object, and exits 1", async () => {
    const server = listenOrExit(express(), 0, LISTENING);
    servers.push(server);
    await once(server, "listening");

    server.emit("error", "a bare string");

    expect(await exited).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "HTTP server encountered an error while starting:",
      "a bare string",
    );
  });

  it("reports any other server error and exits 1", async () => {
    const server = listenOrExit(express(), 0, LISTENING);
    servers.push(server);
    await once(server, "listening");

    const failure = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });
    server.emit("error", failure);

    expect(await exited).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "HTTP server encountered an error while starting:",
      failure,
    );
  });
});
