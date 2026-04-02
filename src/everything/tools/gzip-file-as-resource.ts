import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult, Resource } from "@modelcontextprotocol/sdk/types.js";
import { gzipSync } from "node:zlib";
import {
  getSessionResourceURI,
  registerSessionResource,
} from "../resources/session.js";

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
    .string()
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
    // Fetch the data
    const response = await fetch(url, { signal: controller.signal });
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
