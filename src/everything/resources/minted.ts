// Resources a tool creates for a 2026-07-28 client to read later, served from
// handles the server mints (#4852).
//
// On a 2025-era connection, `gzip-file-as-resource` registers the resource it
// creates on the server instance serving the client's connection or session
// (resources/session.ts), and the resource lasts as long as that instance.
// The 2026-07-28 revision has no sessions, and on its HTTP path every request
// is served by a fresh instance, so a resource registered on one would be gone
// before the client could read it. Instead the resource is stored here, under a
// URI that embeds a random id the server mints, and every 2026-07-28 instance
// serves the store through one resource template. The id is the handle: a
// client can read a minted resource only if it was given the URI. Each one
// expires after ten minutes; an expired or unknown URI reads as not found
// (-32602).

import { randomUUID } from "node:crypto";
import {
  McpServer,
  ResourceNotFoundError,
  ResourceTemplate,
  type ResourceLink,
} from "@modelcontextprotocol/server";

/** How long a minted resource stays readable, in milliseconds. */
export const MINTED_RESOURCE_TTL_MS = 10 * 60_000;

/**
 * The most minted resources the process keeps, and the most bytes of content
 * across them. Each one may be as large as the gzip tool's fetch limit, so
 * without a budget a burst of calls could exhaust memory before the TTL frees
 * anything; past it, the oldest are dropped first.
 */
export const MAX_MINTED_RESOURCES = 100;
export const MAX_MINTED_BYTES = 64 * 1024 * 1024;

/** The URI template every minted resource matches. */
const mintedUriTemplate = "demo://resource/minted/{id}/{name}";

type MintedResource = {
  name: string;
  mimeType: string;
  blob: string;
  expiresAt: number;
};

/** Every live minted resource, by URI, across every server instance. */
const minted = new Map<string, MintedResource>();

/** Drop every minted resource past its expiry. */
function sweep(now: number): void {
  for (const [uri, resource] of minted) {
    if (resource.expiresAt <= now) minted.delete(uri);
  }
}

/**
 * Drop the oldest minted resources (the map keeps insertion order) until one
 * more of `bytes` fits both budgets.
 */
function makeRoom(bytes: number): void {
  let total = bytes;
  for (const [uri, resource] of minted) total += sizeOf(uri, resource);
  for (const [uri, resource] of minted) {
    if (minted.size < MAX_MINTED_RESOURCES && total <= MAX_MINTED_BYTES) break;
    minted.delete(uri);
    total -= sizeOf(uri, resource);
  }
}

/** What a stored resource counts against the budget: everything it keeps. */
function sizeOf(uri: string, resource: MintedResource): number {
  return uri.length + resource.name.length + resource.blob.length;
}

/**
 * Store a blob resource under a freshly minted URI, and return a link to it.
 * Throws for a blob larger than `MAX_MINTED_BYTES`.
 *
 * @param name - The resource's name, the last segment of its URI.
 * @param mimeType - Its MIME type.
 * @param blob - Its content, base64-encoded.
 */
export function mintBlobResource(
  name: string,
  mimeType: string,
  blob: string,
): ResourceLink {
  // One resource larger than the whole budget is refused outright, rather
  // than evicting everything else and still exceeding the budget.
  const uri = `demo://resource/minted/${randomUUID()}/${encodeURIComponent(name)}`;
  const size = uri.length + name.length + blob.length;
  if (size > MAX_MINTED_BYTES) {
    throw new Error(
      `Cannot keep ${name} for later reading: its ${size} bytes exceed the ${MAX_MINTED_BYTES}-byte limit for minted resources`,
    );
  }
  const now = Date.now();
  sweep(now);
  makeRoom(size);
  minted.set(uri, {
    name,
    mimeType,
    blob,
    expiresAt: now + MINTED_RESOURCE_TTL_MS,
  });
  return {
    type: "resource_link",
    uri,
    name,
    mimeType,
    description: `Created by a tool call; readable for ${MINTED_RESOURCE_TTL_MS / 60_000} minutes at this URI`,
  };
}

/**
 * Register the template that serves minted resources, on a 2026-07-28
 * server. It lists nothing: a minted resource is reached by the URI a tool
 * returned.
 *
 * @param server - The 2026-07-28 server to serve them on.
 */
export function registerMintedResources(server: McpServer): void {
  server.registerResource(
    "Minted Resource",
    new ResourceTemplate(mintedUriTemplate, { list: undefined }),
    {
      description:
        "A resource a tool created for this client, such as gzip-file-as-resource's output. Readable for ten minutes at the URI the tool returned.",
    },
    async (uri) => {
      sweep(Date.now());
      const resource = minted.get(uri.toString());
      if (!resource) throw new ResourceNotFoundError(uri.toString());
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: resource.mimeType,
            blob: resource.blob,
          },
        ],
      };
    },
  );
}

/** Forget every minted resource. For tests. */
export function clearMintedResources(): void {
  minted.clear();
}
