// The `gzip-file-as-resource` tool: fetches a file, gzips it, and returns the
// result as an embedded resource or as a link to a resource the client can
// read later.
//
// Where that later resource lives depends on the protocol era (#4852). For a
// 2025-era client it is registered on the server instance serving the
// client's connection or session (resources/session.ts), and lasts as long as
// that does. The 2026-07-28 revision has no sessions, and on its HTTP path
// each request gets a fresh instance, so for a 2026-07-28 client the resource
// is stored under a URI with a server-minted id that every instance can serve
// (resources/minted.ts), and expires after ten minutes.
//
// The tool fetches whatever URL a model hands it, so it refuses non-public
// destinations by default (#5130), as the fetch server does: before every
// request, the caller's URL and each redirect hop alike, the host is checked
// against GZIP_ALLOWED_DOMAINS (a name filter, when set) and then resolved,
// and the request is refused if any address it resolves to is loopback,
// private, link-local (cloud metadata) or otherwise not public, unless
// GZIP_ALLOW_PRIVATE_IPS opts in. Redirects are followed by hand, so that each
// hop passes the same check, up to MAX_REDIRECTS of them.

import { z } from "zod";
import {
  McpServer,
  CallToolResult,
  Resource,
} from "@modelcontextprotocol/server";
import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";
import { gzipSync } from "node:zlib";
import { mintBlobResource } from "../resources/minted.js";
import {
  getSessionResourceURI,
  registerSessionResource,
} from "../resources/session.js";
import type { ServerContext } from "../server/context.js";

// Maximum input file size - 10 MB default
const GZIP_MAX_FETCH_SIZE = Number(
  process.env.GZIP_MAX_FETCH_SIZE ?? String(10 * 1024 * 1024),
);

// Maximum fetch time - 30 seconds default.
const GZIP_MAX_FETCH_TIME_MILLIS = Number(
  process.env.GZIP_MAX_FETCH_TIME_MILLIS ?? String(30 * 1000),
);

// Comma-separated list of allowed domains, matched by name on every request
// (redirect hops included). Empty means any name is allowed. It filters names,
// not addresses: a listed name that resolves to a private address is still
// refused unless GZIP_ALLOW_PRIVATE_IPS is set.
const GZIP_ALLOWED_DOMAINS = (process.env.GZIP_ALLOWED_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter((d) => d.length > 0);

// Opt in to fetching from loopback, private, link-local and other non-public
// addresses (1, true, yes or on). Off by default.
const GZIP_ALLOW_PRIVATE_IPS = /^(1|true|yes|on)$/i.test(
  (process.env.GZIP_ALLOW_PRIVATE_IPS ?? "").trim(),
);

// Redirects followed before a fetch is abandoned.
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Addresses that are not public destinations: the IANA special-purpose ranges
// the fetch server refuses (src/fetch's _NON_PUBLIC_NETWORKS), plus
// multicast. BlockList judges an IPv4-mapped IPv6 address (::ffff:a.b.c.d) by
// the IPv4 rules, so those need no ranges of their own. The well-known NAT64
// prefix (64:ff9b::/96) is not unwrapped and so passes as public.
const NON_PUBLIC_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this network", including the unspecified address
  ["10.0.0.0", 8], // RFC 1918
  ["100.64.0.0", 10], // CGNAT shared space (Alibaba Cloud metadata)
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (most cloud metadata endpoints)
  ["172.16.0.0", 12], // RFC 1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // RFC 1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, and broadcast
] as const) {
  NON_PUBLIC_ADDRESSES.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001::", 23], // IETF protocol assignments (Teredo among them)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local (AWS's fd00:ec2::254)
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  NON_PUBLIC_ADDRESSES.addSubnet(network, prefix, "ipv6");
}

// Globally reachable assignments inside those ranges (anycast services and
// the like), allowed as the fetch server allows its _PUBLIC_EXCEPTIONS.
const PUBLIC_EXCEPTIONS = new BlockList();
PUBLIC_EXCEPTIONS.addAddress("192.0.0.9", "ipv4");
PUBLIC_EXCEPTIONS.addAddress("192.0.0.10", "ipv4");
for (const [network, prefix] of [
  ["2001:1::1", 128],
  ["2001:1::2", 128],
  ["2001:3::", 32],
  ["2001:4:112::", 48],
  ["2001:20::", 28],
  ["2001:30::", 28],
] as const) {
  PUBLIC_EXCEPTIONS.addSubnet(network, prefix, "ipv6");
}

/** True when `address` is not a public destination. */
function isNonPublic(address: string, family: number): boolean {
  const type = family === 6 ? "ipv6" : "ipv4";
  return (
    !PUBLIC_EXCEPTIONS.check(address, type) &&
    NON_PUBLIC_ADDRESSES.check(address, type)
  );
}

/**
 * Settles as `promise` does, or rejects with the signal's reason as soon as it
 * aborts, so that the fetch deadline also bounds work that takes no signal
 * (the DNS lookup).
 */
async function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

// Tool input schema
const GZipFileAsResourceSchema = z.object({
  name: z
    .string()
    .max(255)
    .describe("Name of the output file (at most 255 characters)")
    .default("README.md.gz"),
  data: z
    .url()
    .describe("URL or data URI of the file content to compress")
    .default(
      "https://raw.githubusercontent.com/modelcontextprotocol/servers/refs/heads/main/README.md",
    ),
  outputType: z
    .enum(["resourceLink", "resource"])
    .default("resourceLink")
    .describe(
      "How the resulting gzipped file should be returned. 'resourceLink' returns a link to a resource that can be read later, 'resource' returns a full resource object.",
    ),
});

// Tool configuration
const name = "gzip-file-as-resource";
const config = {
  title: "GZip File as Resource Tool",
  description:
    "Compresses a single file using gzip compression. Depending upon the selected output type, returns either the compressed data as a gzipped resource or a resource link, allowing it to be downloaded in a subsequent request: during the current session for a 2025-era client, or for ten minutes at a minted URI on protocol version 2026-07-28.",
  inputSchema: GZipFileAsResourceSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

/**
 * Registers the `gzip-file-as-resource` tool.
 *
 * The registered tool compresses input data using gzip, and makes the resulting file accessible
 * as a resource for the duration of the session.
 *
 * The tool supports two output types:
 * - "resource": Returns the resource directly, including its URI, MIME type, and base64-encoded content.
 * - "resourceLink": Returns a link to access the resource later.
 *
 * If an unrecognized `outputType` is provided, the tool throws an error.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @param {ServerContext} context - The protocol era the instance serves.
 * @throws {Error} Throws an error if an unknown output type is specified.
 */
export const registerGZipFileAsResourceTool = (
  server: McpServer,
  context: ServerContext,
) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const {
      name,
      data: dataUri,
      outputType,
    } = GZipFileAsResourceSchema.parse(args);

    // Fetch the data; each request it makes is checked first
    const response = await fetchSafely(new URL(dataUri), {
      maxBytes: GZIP_MAX_FETCH_SIZE,
      timeoutMillis: GZIP_MAX_FETCH_TIME_MILLIS,
    });

    // Compress the data using gzip
    const inputBuffer = Buffer.from(response);
    const compressedBuffer = gzipSync(inputBuffer);

    // Create resource
    const uri = getSessionResourceURI(name);
    const blob = compressedBuffer.toString("base64");
    const mimeType = "application/gzip";
    const resource = <Resource>{ uri, name, mimeType };

    // Return the resource or a resource link that can be used to access this resource later
    if (outputType === "resource") {
      return {
        content: [
          {
            type: "resource",
            resource: { uri, mimeType, blob },
          },
        ],
      };
    } else if (outputType === "resourceLink") {
      // Make the resource readable later, where this era can reach it
      const resourceLink =
        context.era === "modern"
          ? mintBlobResource(name, mimeType, blob)
          : registerSessionResource(server, resource, "blob", blob);
      return {
        content: [resourceLink],
      };
    } else {
      /* v8 ignore next -- unreachable: the input schema's enum admits only resource and resourceLink */
      throw new Error(`Unknown outputType: ${outputType}`);
    }
  });
};

/**
 * Refuses a request the server should not make: a protocol other than http,
 * https or data; a host not in GZIP_ALLOWED_DOMAINS, when that is set; or,
 * unless GZIP_ALLOW_PRIVATE_IPS is set, a host that resolves to any address
 * that is not public. Called before every request, redirect hops included.
 *
 * This is a check, then a fetch: `fetch` resolves the name again to connect,
 * so a name whose DNS answer changes between the two (DNS rebinding) can
 * still reach a private address. Closing that window means pinning the
 * checked address for the connection, which this demo server does not do.
 *
 * @param {URL} url The URL about to be requested.
 * @param {AbortSignal} signal The fetch's deadline, which bounds the lookup too.
 * @throws {Error} If the request is refused, or the host cannot be resolved.
 */
async function assertPermittedTarget(
  url: URL,
  signal: AbortSignal,
): Promise<void> {
  const refuse = (reason: string) =>
    new Error(`Error processing file ${url}: ${reason}`);
  if (url.protocol === "data:") return; // carries its own bytes
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw refuse(
      `Unsupported URL protocol for ${url}. Only http, https, and data URLs are supported.`,
    );
  }
  // Names are matched as the URL spells them, an IPv6 literal with its
  // brackets ([::1]), as they always have been
  const domain = url.hostname;
  if (
    GZIP_ALLOWED_DOMAINS.length > 0 &&
    !GZIP_ALLOWED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))
  ) {
    throw refuse(`Domain ${domain} is not in the allowed domains list.`);
  }
  if (GZIP_ALLOW_PRIVATE_IPS) return;
  // The resolver takes an IPv6 literal without its brackets
  const host = domain.replace(/^\[(.*)\]$/, "$1");
  const addresses = await raceAbort(lookup(host, { all: true }), signal);
  for (const { address, family } of addresses) {
    if (isNonPublic(address, family)) {
      throw refuse(
        `${host} resolves to ${address}, which is not a public address. Set GZIP_ALLOW_PRIVATE_IPS=1 to allow private, loopback and link-local addresses.`,
      );
    }
  }
}

/**
 * Requests `url`, following redirects by hand so that every hop passes
 * `assertPermittedTarget` first, and returns the first response that is not a
 * redirect.
 *
 * @param {URL} url The URL the caller asked for.
 * @param {AbortSignal} signal Aborts the request in flight.
 * @return {Promise<Response>} The final response.
 * @throws {Error} If a hop is refused, or there are more than MAX_REDIRECTS.
 */
async function fetchPermitted(
  url: URL,
  signal: AbortSignal,
): Promise<Response> {
  let target = url;
  for (let redirects = 0; ; redirects++) {
    await assertPermittedTarget(target, signal);
    const response = await fetch(target, { signal, redirect: "manual" });
    const location = response.headers.get("location");
    if (!REDIRECT_STATUSES.has(response.status) || location === null) {
      return response;
    }
    // Discard the redirect's own body before moving on. Not awaited, as in
    // fetchSafely: cancel() may never settle, and only the next hop matters.
    response.body?.cancel().catch(
      /* v8 ignore next -- only runs if cancelling the source fails, which nothing here can provoke */
      () => {},
    );
    if (redirects === MAX_REDIRECTS) {
      throw new Error(
        `Fetching ${url} followed more than ${MAX_REDIRECTS} redirects and was abandoned.`,
      );
    }
    target = new URL(location, target);
  }
}

/**
 * Fetches data safely from a given URL while ensuring constraints on maximum byte size and timeout duration.
 *
 * @param {URL} url The URL to fetch data from.
 * @param {Object} options An object containing options for the fetch operation.
 * @param {number} options.maxBytes The maximum allowed size (in bytes) of the response. If the response exceeds this size, the operation will be aborted.
 * @param {number} options.timeoutMillis The timeout duration (in milliseconds) for the fetch operation. If the fetch takes longer, it will be aborted.
 * @return {Promise<ArrayBuffer>} A promise that resolves with the response as an ArrayBuffer if successful.
 * @throws {Error} Throws an error if the response size exceeds the defined limit, the fetch times out, or the response is otherwise invalid.
 */
async function fetchSafely(
  url: URL,
  { maxBytes, timeoutMillis }: { maxBytes: number; timeoutMillis: number },
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () =>
      controller.abort(
        `Fetching ${url} took more than ${timeoutMillis} ms and was aborted.`,
      ),
    timeoutMillis,
  );

  try {
    // Fetch the data, following only redirects that pass the same checks.
    // The response is the final, non-redirect one, so a redirect is never
    // mistaken for an error status here.
    const response = await fetchPermitted(url, controller.signal);
    if (!response.ok) {
      // An error page is not the requested file (#5207). Release the
      // connection without reading the body; as with the size check below,
      // the cancel is not awaited and its rejection is swallowed, since the
      // thrown status error is the failure this path reports.
      response.body?.cancel().catch(
        /* v8 ignore next -- only runs if cancelling the source fails, which nothing here can provoke */
        () => {},
      );
      throw new Error(
        `Fetching ${url} failed with HTTP ${response.status} ${response.statusText}`,
      );
    }
    if (!response.body) {
      throw new Error("No response body");
    }

    // Note: we can't trust the Content-Length header: a malicious or clumsy server could return much more data than advertised.
    // We check it here for early bail-out, but we still need to monitor actual bytes read below.
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader != null) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (contentLength > maxBytes) {
        throw new Error(
          `Content-Length for ${url} exceeds max of ${maxBytes}: ${contentLength}`,
        );
      }
    }

    // Read the fetched data from the response body
    const reader = response.body.getReader();
    const chunks = [];
    let totalSize = 0;

    // Read chunks until done
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.length;

        if (totalSize > maxBytes) {
          // Not awaited: cancel() adopts the source's promise and may never
          // settle, and we are about to throw anyway. Swallow its rejection so
          // it cannot surface as an unhandled one; the thrown size error is
          // the failure this path reports.
          reader.cancel().catch(
            /* v8 ignore next -- only runs if cancelling the source fails, which nothing here can provoke */
            () => {},
          );
          throw new Error(`Response from ${url} exceeds ${maxBytes} bytes`);
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    // Combine chunks into a single buffer
    const buffer = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    return buffer.buffer;
  } finally {
    clearTimeout(timeout);
  }
}
