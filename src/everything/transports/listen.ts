// Binds an HTTP transport's Express app to its port, and is the one place that
// decides whether that worked (#4923).
//
// Express 5 passes a listen error to the same callback it calls on success, so
// a callback that ignores its argument prints "running" for a server bound to
// nothing, and with no `error` listener the process then stays up on no port.
// Both HTTP transports start through here so neither can report a port it
// does not hold: the listening line is printed only for a real bind, and a
// failed one names the port and exits non-zero, which is what lets a launcher
// (the boot smoke, `npm`) see the failure and retry or report it.
//
// It is also the one place that decides which interface they bind (#5371).
// With no host, `listen` binds every interface, which hands a developer's
// tools to every machine on the local network: the Origin check stops a
// foreign browser page, but a non-browser client sends no Origin. So the
// default is loopback, and `HOST` widens it deliberately (`HOST=0.0.0.0`, as
// the container image sets so a published port reaches the server).

import type { Server } from "node:http";
import type { Express } from "express";

/** The interface the HTTP transports bind when `HOST` is unset: loopback only. */
export const DEFAULT_HOST = "127.0.0.1";

/** The host to bind: `HOST` when it is set and not empty, else loopback. */
export function bindHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOST || DEFAULT_HOST;
}

/** `host:port` for a log line, with an IPv6 literal in brackets (`[::1]:3001`). */
export function hostAndPort(host: string, port: string | number): string {
  return `${host.includes(":") ? `[${host}]` : host}:${port}`;
}

/**
 * Start `app` on `port` of `host`. Prints `listeningMessage` once the port is
 * bound; on a bind failure prints why and exits the process with status 1.
 */
export function listenOrExit(
  app: Express,
  port: string | number,
  host: string,
  listeningMessage: string,
): Server {
  const server = app.listen({ port, host }, (error?: Error) => {
    // A failed bind arrives here too; the `error` listener below reports it.
    if (error) return;
    console.error(listeningMessage);
  });

  server.on("error", (err: unknown) => {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code?: unknown }).code
        : undefined;
    if (code === "EADDRINUSE") {
      console.error(
        `Failed to start: Port ${port} is already in use on ${host}. Set PORT to a free port or stop the conflicting process.`,
      );
    } else {
      console.error("HTTP server encountered an error while starting:", err);
    }
    // Ensure a non-zero exit so npm reports the failure instead of silently exiting
    process.exit(1);
  });

  return server;
}
