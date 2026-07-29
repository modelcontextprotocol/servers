import { afterEach, describe, expect, it } from "vitest";
import {
  createServer as createHttpServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
} from "node:http";
import { createSseApp } from "../transports/sse.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

async function request(
  path: string,
  method = "GET"
): Promise<{ status: number; body: string }> {
  const server = createHttpServer(createSseApp());
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address");
  }

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port: address.port, path, method },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
          })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

describe("SSE missing-session handling", () => {
  it("returns 404 for GET requests with an unknown session", async () => {
    const response = await request("/sse?sessionId=missing");
    expect(response.status).toBe(404);
    expect(response.body).toContain("No transport found");
  });

  it("returns 404 for POST requests with an unknown session", async () => {
    const response = await request("/message?sessionId=missing", "POST");
    expect(response.status).toBe(404);
    expect(response.body).toContain("No transport found");
  });
});
