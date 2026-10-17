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

import type { Server } from "node:http";
import type { Express } from "express";

/**
 * Start `app` on `port`. Prints `listeningMessage` once the port is bound; on a
 * bind failure prints why and exits the process with status 1.
 */
export function listenOrExit(
  app: Express,
  port: string | number,
  listeningMessage: string,
): Server {
  const server = app.listen(port, (error?: Error) => {
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
        `Failed to start: Port ${port} is already in use. Set PORT to a free port or stop the conflicting process.`,
      );
    } else {
      console.error("HTTP server encountered an error while starting:", err);
    }
    // Ensure a non-zero exit so npm reports the failure instead of silently exiting
    process.exit(1);
  });

  return server;
}
