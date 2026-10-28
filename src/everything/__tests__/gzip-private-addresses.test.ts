/**
 * Characterizes how `gzip-file-as-resource` treats non-public destinations
 * with its default configuration (#5130): a URL whose host is, or resolves
 * to, a loopback, private, link-local or other non-public address is refused
 * before anything is requested, and so is a redirect from a public origin to
 * one. A public origin cannot be reached from a test, so `node:dns/promises`
 * and `fetch` are stubbed for one name, `public.example`; every other name
 * and URL goes to the real resolver and the real `fetch`. The opt-in
 * (`GZIP_ALLOW_PRIVATE_IPS`) is exercised by the other gzip suites, whose
 * fixtures are on loopback. The fetch deadline is shortened, before the
 * server loads, to show that it bounds a lookup that never answers.
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
import { connect, contentOf, textOf, type Session } from "./harness.js";

vi.hoisted(() => {
  vi.stubEnv("GZIP_MAX_FETCH_TIME_MILLIS", "500");
});

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  const stubbed: Record<string, { address: string; family: number }> = {
    "public.example": { address: "93.184.215.14", family: 4 },
    "anycast.example": { address: "192.0.0.9", family: 4 }, // inside 192.0.0.0/24
    "anycast6.example": { address: "2001:3::1", family: 6 }, // inside 2001::/23
  };
  return {
    ...actual,
    lookup: (hostname: string, options: { all: true }) => {
      if (hostname === "stalled.example") return new Promise(() => {});
      const answer = stubbed[hostname];
      return answer
        ? Promise.resolve([answer])
        : actual.lookup(hostname, options);
    },
  };
});

let http: Server;
let port: number;
let hits = 0;

beforeAll(async () => {
  http = createHttpServer((_req, res) => {
    hits++;
    res.end("internal only");
  });
  http.listen(0); // every interface, so 127.0.0.1, ::1 and localhost reach it
  await once(http, "listening");
  const address = http.address();
  if (address === null || typeof address === "string")
    throw new Error("no port");
  port = address.port;

  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: URL, init?: RequestInit) => {
    if (!input.hostname.endsWith(".example")) return realFetch(input, init);
    if (input.pathname === "/to-loopback") {
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: `http://127.0.0.1:${port}/secret` },
        }),
      );
    }
    return Promise.resolve(new Response("public content"));
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  http.closeAllConnections();
  await new Promise((resolve) => http.close(resolve));
});

let session: Session | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  hits = 0;
});

async function gzip(data: string) {
  session ??= await connect();
  const result = await session.client.callTool({
    name: "gzip-file-as-resource",
    arguments: { name: "private.gz", data },
  });
  return contentOf(result)[0];
}

const refusal = (url: string, host: string, address: string) =>
  `Error processing file ${url}: ${host} resolves to ${address}, which is not a public address. Set GZIP_ALLOW_PRIVATE_IPS=1 to allow private, loopback and link-local addresses.`;

describe("gzip-file-as-resource private addresses (#5130)", () => {
  it("refuses a loopback address by default, without requesting it", async () => {
    const url = `http://127.0.0.1:${port}/secret`;
    expect(textOf(await gzip(url))).toBe(
      refusal(url, "127.0.0.1", "127.0.0.1"),
    );
    expect(hits).toBe(0);
  });

  it("refuses an IPv6 loopback address, and an IPv4-mapped one", async () => {
    const v6 = `http://[::1]:${port}/secret`;
    expect(textOf(await gzip(v6))).toBe(refusal(v6, "::1", "::1"));
    const mapped = `http://[::ffff:7f00:1]:${port}/secret`;
    expect(textOf(await gzip(`http://[::ffff:127.0.0.1]:${port}/secret`))).toBe(
      refusal(mapped, "::ffff:7f00:1", "::ffff:7f00:1"),
    );
    expect(hits).toBe(0);
  });

  it("refuses a name that resolves to a loopback address", async () => {
    const url = `http://localhost:${port}/secret`;
    expect(textOf(await gzip(url))).toMatch(
      /^Error processing file http:\/\/localhost:\d+\/secret: localhost resolves to (::1|127\.0\.0\.1), which is not a public address\./,
    );
    expect(hits).toBe(0);
  });

  it.each([
    ["link-local (cloud metadata)", "169.254.169.254"],
    ["RFC 1918", "10.1.2.3"],
    ["CGNAT", "100.100.100.200"],
    ["unspecified", "0.0.0.0"],
    ["multicast", "224.0.0.1"],
  ])("refuses a %s address", async (_kind, address) => {
    const url = `http://${address}/latest/meta-data/`;
    expect(textOf(await gzip(url))).toBe(refusal(url, address, address));
  });

  it.each([
    ["unique local", "fd00:ec2::254"],
    ["link-local", "fe80::1"],
  ])("refuses an IPv6 %s address", async (_kind, address) => {
    const url = `http://[${address}]/latest/meta-data/`;
    expect(textOf(await gzip(url))).toBe(refusal(url, address, address));
  });

  it("fetches from a public address", async () => {
    expect(await gzip("http://public.example/file")).toMatchObject({
      type: "resource_link",
      uri: "demo://resource/session/private.gz",
    });
  });

  it.each([
    ["IPv4", "anycast.example"],
    ["IPv6", "anycast6.example"],
  ])(
    "fetches from a globally reachable %s exception inside a refused range",
    async (_family, host) => {
      expect(await gzip(`http://${host}/file`)).toMatchObject({
        type: "resource_link",
      });
    },
  );

  it("bounds the address lookup by GZIP_MAX_FETCH_TIME_MILLIS", async () => {
    const url = "http://stalled.example/file";
    expect(textOf(await gzip(url))).toBe(
      `Fetching ${url} took more than 500 ms and was aborted.`,
    );
  });

  it("refuses a redirect from a public origin to a loopback address", async () => {
    const hop = `http://127.0.0.1:${port}/secret`;
    expect(textOf(await gzip("http://public.example/to-loopback"))).toBe(
      refusal(hop, "127.0.0.1", "127.0.0.1"),
    );
    expect(hits).toBe(0);
  });
});
