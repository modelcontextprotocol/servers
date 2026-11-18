// Serves the memory server over Streamable HTTP (#576), the alternative to
// stdio that `--transport streamable-http` selects.
//
// One `/mcp` endpoint answers both protocol eras through the SDK's
// `createMcpHandler`: a 2026-07-28 request is served by a fresh server built
// for it, and a 2025-era request by the SDK's stateless fallback (also a fresh
// server per request, with no session, so GET and DELETE are answered 405).
// The graph lives in its file, so a fresh server per request loses nothing;
// the file lock orders concurrent mutations as it does between processes.
// A 2026-07-28 client hears of graph changes on its subscriptions/listen
// stream: each server publishes them on the handler's bus rather than on its
// own request. A 2025-era client has no session, so resources/subscribe
// cannot outlive its request and HTTP sends it no updates.
//
// The listener binds loopback unless `HOST` widens it, and a browser page may
// reach it only from a localhost Origin, the same posture as the everything
// server's HTTP transports (#5371). `startHttpServer()` resolves once the port
// is bound and rejects when it cannot be, so a launcher sees the failure.

import { createServer as createNodeServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createMcpHandler,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import {
  localhostOriginValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { createServer, RESOURCE_URI } from "./index.js";
import type { GraphLimits } from "./index.js";

/** The interface bound when `HOST` is unset: loopback only. */
export const DEFAULT_HOST = "127.0.0.1";
/** The port bound when `PORT` is unset. */
export const DEFAULT_PORT = 3001;
/** The one path the endpoint answers on. */
export const MCP_PATH = "/mcp";

/** Where to listen: `HOST` and `PORT` from the environment, else the defaults. */
export function httpEndpoint(env: NodeJS.ProcessEnv = process.env): {
  host: string;
  port: number;
} {
  const host = env.HOST || DEFAULT_HOST;
  if (!env.PORT) return { host, port: DEFAULT_PORT };
  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(
      `Invalid PORT ${JSON.stringify(env.PORT)}: expected a whole number from 0 to 65535`,
    );
  }
  return { host, port };
}

/** The URL of the endpoint bound at `address`:`port`, an IPv6 literal in brackets. */
export function endpointUrl(address: string, port: number): string {
  const host = address.includes(":") ? `[${address}]` : address;
  return `http://${host}:${port}${MCP_PATH}`;
}

/** A running HTTP endpoint: the bound address, and how to stop it. */
export interface RunningHttpServer {
  httpServer: Server;
  handler: McpHttpHandler;
  /** The URL clients connect to, with the port actually bound. */
  url: string;
  /** End in-flight MCP exchanges, then stop listening and drop open sockets. */
  close: () => Promise<void>;
}

/**
 * Bind the endpoint on `host`:`port` (port 0 picks a free one) and serve the
 * memory server over the graph at `memoryFilePath` on it, holding its write
 * tools to `limits`. Rejects when the port cannot be bound.
 */
export async function startHttpServer(
  memoryFilePath: string,
  { host, port }: { host: string; port: number },
  limits: GraphLimits = {},
): Promise<RunningHttpServer> {
  const onerror = (error: Error) =>
    console.error("Error serving MCP request:", error);
  const handler: McpHttpHandler = createMcpHandler(
    ({ era }) =>
      createServer(
        memoryFilePath,
        era,
        () => handler.notify.resourceUpdated(RESOURCE_URI),
        limits,
      ),
    { onerror },
  );
  const serve = toNodeHandler(handler, { onerror });
  const allowOrigin = localhostOriginValidation();

  const httpServer = createNodeServer((req, res) => {
    // The path, without parsing the target: a malformed one (`//[`) would
    // make URL parsing throw here, outside any handler, and end the process.
    const path = String(req.url).split("?")[0];
    if (path !== MCP_PATH) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not Found");
      return;
    }
    if (!allowOrigin(req, res)) return;
    // Not awaited: the listener is synchronous. The adapter never rejects; it
    // reports a failure through `onerror` and answers it with a 500 itself.
    void serve(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen({ host, port }, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const bound = httpServer.address() as AddressInfo;
  return {
    httpServer,
    handler,
    url: endpointUrl(bound.address, bound.port),
    close: async () => {
      await handler.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
        httpServer.closeAllConnections();
      });
    },
  };
}
