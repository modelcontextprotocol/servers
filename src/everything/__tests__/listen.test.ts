// `listenOrExit` is what stops an HTTP transport from reporting a port it does
// not hold (#4923: SSE printed "Server is running" on a port another process
// had, and stayed up listening on nothing). These tests bind real sockets,
// because the defect lived in how Express hands a real listen error to the
// success callback; a mocked `listen` would not have reproduced it.
// `process.exit` is replaced so the failure path can be observed without ending
// the test run, and `console.error` is silenced because that path prints.
// The bind address is checked the same way, on a real socket: loopback unless
// `HOST` says otherwise (#5371).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import express from "express";
import {
  bindHost,
  DEFAULT_HOST,
  hostAndPort,
  listenOrExit,
} from "../transports/listen.js";

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

  /** A server holding a port on loopback, and the port it holds. */
  async function holdPort(): Promise<number> {
    const holder = createServer();
    servers.push(holder);
    // The address the transports bind by default: a holder on another
    // interface (the wildcard) would not conflict with it on every platform.
    holder.listen(0, DEFAULT_HOST);
    await once(holder, "listening");
    const address = holder.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a TCP address");
    }
    return address.port;
  }

  /** The address `server` is bound to. */
  function boundAddress(server: Server): string {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a TCP address");
    }
    return address.address;
  }

  it("prints the listening line once the port is bound, and does not exit", async () => {
    const server = listenOrExit(express(), 0, DEFAULT_HOST, LISTENING);
    servers.push(server);
    await once(server, "listening");

    expect(server.listening).toBe(true);
    expect(boundAddress(server)).toBe("127.0.0.1");
    expect(errorSpy).toHaveBeenCalledWith(LISTENING);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("reports a port already in use and exits 1 without claiming to listen", async () => {
    const port = await holdPort();
    const server = listenOrExit(express(), port, DEFAULT_HOST, LISTENING);
    servers.push(server);

    expect(await exited).toBe(1);
    expect(server.listening).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      `Failed to start: Port ${port} is already in use on 127.0.0.1. Set PORT to a free port or stop the conflicting process.`,
    );
    expect(errorSpy).not.toHaveBeenCalledWith(LISTENING);
  });

  it("binds the host it is given, such as every interface", async () => {
    const server = listenOrExit(express(), 0, "0.0.0.0", LISTENING);
    servers.push(server);
    await once(server, "listening");

    expect(boundAddress(server)).toBe("0.0.0.0");
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("reports a host it cannot bind, and exits 1 without claiming to listen", async () => {
    // A reserved documentation address (RFC 5737), on no interface here.
    const server = listenOrExit(express(), 0, "192.0.2.1", LISTENING);
    servers.push(server);

    expect(await exited).toBe(1);
    expect(server.listening).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "HTTP server encountered an error while starting:",
      expect.objectContaining({ code: "EADDRNOTAVAIL" }),
    );
    expect(errorSpy).not.toHaveBeenCalledWith(LISTENING);
  });

  it("reports an error that is not an object, and exits 1", async () => {
    const server = listenOrExit(express(), 0, DEFAULT_HOST, LISTENING);
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
    const server = listenOrExit(express(), 0, DEFAULT_HOST, LISTENING);
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

describe("bindHost", () => {
  it("is loopback when HOST is unset", () => {
    expect(bindHost({})).toBe("127.0.0.1");
    expect(DEFAULT_HOST).toBe("127.0.0.1");
  });

  it("is loopback when HOST is empty", () => {
    expect(bindHost({ HOST: "" })).toBe("127.0.0.1");
  });

  it("is HOST when it is set", () => {
    expect(bindHost({ HOST: "0.0.0.0" })).toBe("0.0.0.0");
  });

  it("reads the process environment by default", () => {
    vi.stubEnv("HOST", "::1");
    try {
      expect(bindHost()).toBe("::1");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("hostAndPort", () => {
  it("joins a host name or IPv4 address and a port", () => {
    expect(hostAndPort("127.0.0.1", 3001)).toBe("127.0.0.1:3001");
    expect(hostAndPort("localhost", "4567")).toBe("localhost:4567");
  });

  it("brackets an IPv6 literal", () => {
    expect(hostAndPort("::1", 3001)).toBe("[::1]:3001");
  });
});
