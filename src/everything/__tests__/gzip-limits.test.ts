/**
 * Characterizes the environment variables that configure
 * `gzip-file-as-resource` (#4854): `GZIP_MAX_FETCH_SIZE`,
 * `GZIP_MAX_FETCH_TIME_MILLIS` and `GZIP_ALLOWED_DOMAINS`. The tool reads them
 * once, when its module loads, so this file sets them before it imports the
 * server (vitest gives each test file its own module graph).
 */
import { createServer as createHttpServer, type Server } from "node:http";
import { once } from "node:events";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Session } from "./harness.js";

let harness: typeof import("./harness.js");
let http: Server;
let port: number;

beforeAll(async () => {
  vi.stubEnv("GZIP_MAX_FETCH_SIZE", "16");
  vi.stubEnv("GZIP_MAX_FETCH_TIME_MILLIS", "150");
  vi.stubEnv("GZIP_ALLOWED_DOMAINS", " Example.COM, localhost ,,");
  harness = await import("./harness.js");

  http = createHttpServer((req, res) => {
    if (req.url === "/hang") return; // never answers
    res.end("small");
  });
  http.listen(0); // every interface, so both localhost and 127.0.0.1 reach it
  await once(http, "listening");
  const address = http.address();
  if (address === null || typeof address === "string")
    throw new Error("no port");
  port = address.port;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  http.closeAllConnections();
  await new Promise((resolve) => http.close(resolve));
});

let session: Session | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
});

async function gzip(data: string) {
  session ??= await harness.connect();
  const result = await session.client.callTool({
    name: "gzip-file-as-resource",
    arguments: { name: "limited.gz", data },
  });
  return harness.contentOf(result)[0];
}

async function gzipText(data: string): Promise<string> {
  return harness.textOf(await gzip(data));
}

describe("gzip-file-as-resource limits", () => {
  it("refuses a host that is not in GZIP_ALLOWED_DOMAINS", async () => {
    const url = `http://127.0.0.1:${port}/file`;
    expect(await gzipText(url)).toBe(
      `Error processing file ${url}: Domain 127.0.0.1 is not in the allowed domains list.`,
    );
  });

  it("allows a listed host, case and whitespace aside", async () => {
    expect(await gzip(`http://localhost:${port}/file`)).toMatchObject({
      type: "resource_link",
      uri: "demo://resource/session/limited.gz",
    });
  });

  it("refuses a host that only ends with a listed domain's name", async () => {
    const lookalike = "https://notexample.com/x";
    expect(await gzipText(lookalike)).toBe(
      `Error processing file ${lookalike}: Domain notexample.com is not in the allowed domains list.`,
    );
  });

  it("does not apply the domain list to data: URLs, but does apply the size limit", async () => {
    const data = `data:text/plain;base64,${Buffer.from("x".repeat(17)).toString("base64")}`;
    expect(await gzipText(data)).toBe(`Response from ${data} exceeds 16 bytes`);
  });

  it("aborts a fetch that takes longer than GZIP_MAX_FETCH_TIME_MILLIS", async () => {
    const url = `http://localhost:${port}/hang`;
    expect(await gzipText(url)).toBe(
      `Fetching ${url} took more than 150 ms and was aborted.`,
    );
  });
});
