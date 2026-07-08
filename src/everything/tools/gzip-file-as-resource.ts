import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult, Resource } from "@modelcontextprotocol/sdk/types.js";
import { gzipSync } from "node:zlib";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  getSessionResourceURI,
  registerSessionResource,
} from "../resources/session.js";

// Maximum number of redirect hops to follow (and re-validate) when fetching.
const GZIP_MAX_REDIRECTS = 20;

// Maximum input file size - 10 MB default
const GZIP_MAX_FETCH_SIZE = Number(
  process.env.GZIP_MAX_FETCH_SIZE ?? String(10 * 1024 * 1024)
);

// Maximum fetch time - 30 seconds default.
const GZIP_MAX_FETCH_TIME_MILLIS = Number(
  process.env.GZIP_MAX_FETCH_TIME_MILLIS ?? String(30 * 1000)
);

// Comma-separated list of allowed domains. Empty means all domains are allowed.
const GZIP_ALLOWED_DOMAINS = (process.env.GZIP_ALLOWED_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter((d) => d.length > 0);

// Tool input schema
const GZipFileAsResourceSchema = z.object({
  name: z.string().describe("Name of the output file").default("README.md.gz"),
  data: z
    .url()
    .describe("URL or data URI of the file content to compress")
    .default(
      "https://raw.githubusercontent.com/modelcontextprotocol/servers/refs/heads/main/README.md"
    ),
  outputType: z
    .enum(["resourceLink", "resource"])
    .default("resourceLink")
    .describe(
      "How the resulting gzipped file should be returned. 'resourceLink' returns a link to a resource that can be read later, 'resource' returns a full resource object."
    ),
});

// Tool configuration
const name = "gzip-file-as-resource";
const config = {
  title: "GZip File as Resource Tool",
  description:
    "Compresses a single file using gzip compression. Depending upon the selected output type, returns either the compressed data as a gzipped resource or a resource link, allowing it to be downloaded in a subsequent request during the current session.",
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
 * @throws {Error} Throws an error if an unknown output type is specified.
 */
export const registerGZipFileAsResourceTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const {
      name,
      data: dataUri,
      outputType,
    } = GZipFileAsResourceSchema.parse(args);

    // Validate data uri
    const url = validateDataURI(dataUri);

    // Fetch the data
    const response = await fetchSafely(url, {
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

    // Register resource, get resource link in return
    const resourceLink = registerSessionResource(
      server,
      resource,
      "blob",
      blob
    );

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
      return {
        content: [resourceLink],
      };
    } else {
      throw new Error(`Unknown outputType: ${outputType}`);
    }
  });
};

/**
 * Validates a given data URI to ensure it follows the appropriate protocols and rules.
 *
 * @param {string} dataUri - The data URI to validate. Must be an HTTP, HTTPS, or data protocol URL. If a domain is provided, it must match the allowed domains list if applicable.
 * @return {URL} The validated and parsed URL object.
 * @throws {Error} If the data URI does not use a supported protocol or does not meet allowed domains criteria.
 */
function validateDataURI(dataUri: string): URL {
  // Validate Inputs
  const url = new URL(dataUri);
  try {
    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:" &&
      url.protocol !== "data:"
    ) {
      throw new Error(
        `Unsupported URL protocol for ${dataUri}. Only http, https, and data URLs are supported.`
      );
    }
    if (
      GZIP_ALLOWED_DOMAINS.length > 0 &&
      (url.protocol === "http:" || url.protocol === "https:")
    ) {
      const domain = url.hostname;
      const domainAllowed = GZIP_ALLOWED_DOMAINS.some((allowedDomain) => {
        return domain === allowedDomain || domain.endsWith(`.${allowedDomain}`);
      });
      if (!domainAllowed) {
        throw new Error(`Domain ${domain} is not in the allowed domains list.`);
      }
    }
  } catch (error) {
    throw new Error(
      `Error processing file ${dataUri}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  return url;
}

/**
 * Determines whether an IPv4 address string falls in a range that must not be
 * fetched (loopback, private, link-local/cloud-metadata, reserved, etc.).
 */
function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    // Not a well-formed IPv4 address; treat as blocked to fail closed.
    return true;
  }
  const asInt =
    ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const inRange = (base: string, bits: number): boolean => {
    const b = base.split(".").map((p) => parseInt(p, 10));
    const baseInt = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (asInt & mask) === (baseInt & mask);
  };
  return (
    inRange("0.0.0.0", 8) || // "this" network / unspecified
    inRange("10.0.0.0", 8) || // private
    inRange("100.64.0.0", 10) || // carrier-grade NAT
    inRange("127.0.0.0", 8) || // loopback
    inRange("169.254.0.0", 16) || // link-local (incl. cloud metadata 169.254.169.254)
    inRange("172.16.0.0", 12) || // private
    inRange("192.0.0.0", 24) || // IETF protocol assignments
    inRange("192.0.2.0", 24) || // TEST-NET-1
    inRange("192.168.0.0", 16) || // private
    inRange("198.18.0.0", 15) || // benchmarking
    inRange("198.51.100.0", 24) || // TEST-NET-2
    inRange("203.0.113.0", 24) || // TEST-NET-3
    inRange("224.0.0.0", 4) || // multicast
    inRange("240.0.0.0", 4) // reserved (incl. 255.255.255.255)
  );
}

/**
 * Expands an IPv6 address string (possibly using "::" compression and/or a
 * trailing dotted-quad IPv4 suffix) into its 8 16-bit hextets. Returns null if
 * the address cannot be parsed.
 */
function expandIpv6(addr: string): number[] | null {
  let s = addr;
  // Convert a trailing IPv4 dotted-quad (e.g. ::ffff:127.0.0.1) into hextets.
  const v4match = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4match) {
    const v4 = v4match[2].split(".").map((p) => parseInt(p, 10));
    if (v4.length !== 4 || v4.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return null;
    }
    const h1 = ((v4[0] << 8) | v4[1]).toString(16);
    const h2 = ((v4[2] << 8) | v4[3]).toString(16);
    s = `${v4match[1]}${h1}:${h2}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    return head.map((g) => parseInt(g, 16));
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const groups = [...head, ...Array(missing).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  return groups.map((g) => parseInt(g || "0", 16));
}

/**
 * Determines whether an IPv6 address string must not be fetched. IPv4-mapped
 * addresses (in either dotted or hex form) are unwrapped and classified as IPv4.
 */
function isBlockedIpv6(ip: string): boolean {
  const g = expandIpv6(ip.toLowerCase());
  if (!g || g.some((h) => Number.isNaN(h))) {
    return true; // fail closed on anything we cannot parse
  }
  // IPv4-mapped (::ffff:a.b.c.d): first 80 bits zero, next 16 bits 0xffff.
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return isBlockedIpv4(v4);
  }
  if (g.every((h) => h === 0)) return true; // :: unspecified
  if (g.slice(0, 7).every((h) => h === 0) && g[7] === 1) return true; // ::1 loopback
  const first = g[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/**
 * Resolves a URL's host and throws if any resolved address is a non-public
 * (loopback/private/link-local/metadata) IP, to prevent SSRF. Only http/https
 * URLs are checked; other schemes (e.g. data:) are left to the caller.
 *
 * @param {URL} url The URL whose destination host should be validated.
 * @throws {Error} If the host resolves to a blocked address or cannot be resolved.
 */
async function assertPublicHost(url: URL): Promise<void> {
  // url.hostname keeps brackets around IPv6 literals; strip them.
  const host = url.hostname.replace(/^\[|\]$/g, "");

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    const resolved = await lookup(host, { all: true });
    addresses = resolved.map((r) => r.address);
    if (addresses.length === 0) {
      throw new Error(`Could not resolve host ${host} for ${url}`);
    }
  }

  for (const address of addresses) {
    const blocked =
      isIP(address) === 6 ? isBlockedIpv6(address) : isBlockedIpv4(address);
    if (blocked) {
      throw new Error(
        `Refusing to fetch ${url}: host ${host} resolves to non-public address ${address} (SSRF protection).`
      );
    }
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
  { maxBytes, timeoutMillis }: { maxBytes: number; timeoutMillis: number }
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () =>
      controller.abort(
        `Fetching ${url} took more than ${timeoutMillis} ms and was aborted.`
      ),
    timeoutMillis
  );

  try {
    // Fetch the data, following redirects manually so every hop is re-validated
    // against the SSRF guard (automatic redirects would bypass it).
    const response = await fetchWithGuardedRedirects(url, controller.signal);
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
          `Content-Length for ${url} exceeds max of ${maxBytes}: ${contentLength}`
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
          reader.cancel();
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

/**
 * Performs a fetch that follows redirects manually, validating the destination
 * host against the SSRF guard before every hop. Non-http(s) URLs (e.g. data:)
 * are fetched without host validation, and redirects to non-http(s) schemes are
 * refused.
 *
 * @param {URL} url The initial URL to fetch.
 * @param {AbortSignal} signal The abort signal used to enforce the fetch timeout.
 * @return {Promise<Response>} The final (non-redirect) response.
 * @throws {Error} If a hop resolves to a blocked host, a redirect targets an
 *   unsupported scheme, or the redirect limit is exceeded.
 */
async function fetchWithGuardedRedirects(
  url: URL,
  signal: AbortSignal
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= GZIP_MAX_REDIRECTS; hop++) {
    if (current.protocol === "http:" || current.protocol === "https:") {
      await assertPublicHost(current);
    }

    const response = await fetch(current, { signal, redirect: "manual" });

    const isRedirect =
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.has("location");
    if (!isRedirect) {
      return response;
    }

    const next = new URL(response.headers.get("location")!, current);
    if (next.protocol !== "http:" && next.protocol !== "https:") {
      throw new Error(
        `Refusing to follow redirect from ${current} to unsupported protocol ${next.protocol}`
      );
    }
    current = next;
  }

  throw new Error(
    `Too many redirects while fetching ${url} (max ${GZIP_MAX_REDIRECTS}).`
  );
}
