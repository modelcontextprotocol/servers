import { createServer, Server } from "node:http";
import type { Express } from "express";

export interface HttpServerOptions {
  /** Port to bind. Mirrors what each transport reads from `PORT`. */
  port: string | number;
  /** Printed on stderr once the socket is bound. */
  listeningMessage: string;
}

/**
 * Bind an Express app for an HTTP-based transport and fail loudly on a bind error.
 *
 * Uses `http.createServer(app)` rather than `app.listen(port, onListening)`.
 * Express registers `onListening` for the `error` event as well as `listening`,
 * so a failed bind (`EADDRINUSE`, `EACCES`) invokes it with the error as its
 * argument: the transport prints "Server is running on port N" while it is
 * bound to nothing and stays up. Driving the server directly leaves the
 * success callback to the `listening` event alone and gives `error` a single
 * owner, which reports the conflict and exits non-zero.
 */
export function startHttpServer(
  app: Express,
  { port, listeningMessage }: HttpServerOptions
): Server {
  const server = createServer(app);

  server.listen(port, () => {
    console.error(listeningMessage);
  });

  server.on("error", (err: unknown) => {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code?: unknown }).code
        : undefined;
    if (code === "EADDRINUSE") {
      console.error(
        `Failed to start: Port ${port} is already in use. Set PORT to a free port or stop the conflicting process.`
      );
    } else {
      console.error("HTTP server encountered an error while starting:", err);
    }
    // Ensure a non-zero exit so npm reports the failure instead of silently exiting
    process.exit(1);
  });

  return server;
}
