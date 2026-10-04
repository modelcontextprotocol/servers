/**
 * Characterizes `gzip-file-as-resource` and the session resources it creates
 * (#4854), with its default limits: fetching a `data:` or local `http:` URL,
 * returning the gzipped file as a resource link or an embedded resource,
 * registering it for later reads, and the errors for bad protocols, oversized
 * or empty responses and failed fetches. It also pins #4808: two sessions that
 * use the same file name evict each other's resource. The configurable limits
 * are in `gzip-limits.test.ts`.
 */
import { createServer as createHttpServer, type Server } from "node:http";
import { once } from "node:events";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  connect,
  contentOf,
  contentOfType,
  ofMethod,
  textOf,
  type Session,
} from "./harness.js";

const TEXT = "hello, gzip";
const DATA_URI = `data:text/plain;base64,${Buffer.from(TEXT).toString("base64")}`;
const TEN_MB = 10 * 1024 * 1024;

let http: Server;
let base: string;

beforeAll(async () => {
  http = createHttpServer((req, res) => {
    switch (req.url) {
      case "/file.txt":
        res.end("served over http");
        break;
      case "/empty":
        res.writeHead(204).end();
        break;
      case "/claims-too-big":
        res.writeHead(200, { "content-length": String(TEN_MB + 1) });
        res.write("x");
        break;
      case "/streams-too-much": {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        const chunk = Buffer.alloc(1024 * 1024, 120);
        for (let i = 0; i < 11; i++) res.write(chunk);
        res.end();
        break;
      }
      default:
        res.writeHead(404).end();
    }
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  if (address === null || typeof address === "string")
    throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  http.closeAllConnections();
  await new Promise((resolve) => http.close(resolve));
});

const sessions: Session[] = [];

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((s) => s.close()));
});

async function open(): Promise<Session> {
  const s = await connect();
  sessions.push(s);
  return s;
}

async function gzip(s: Session, args: Record<string, unknown>) {
  return s.client.callTool({ name: "gzip-file-as-resource", arguments: args });
}

async function readBlob(s: Session, uri: string): Promise<Buffer> {
  const { contents } = await s.client.readResource({ uri });
  expect(contents).toHaveLength(1);
  expect(contents[0]).toMatchObject({ uri, mimeType: "application/gzip" });
  return Buffer.from("blob" in contents[0] ? contents[0].blob : "", "base64");
}

describe("gzip-file-as-resource", () => {
  it("returns a link to a session resource holding the gzipped data", async () => {
    const s = await open();
    const result = await gzip(s, { name: "hello.txt.gz", data: DATA_URI });
    expect(result.content).toEqual([
      {
        type: "resource_link",
        uri: "demo://resource/session/hello.txt.gz",
        name: "hello.txt.gz",
        mimeType: "application/gzip",
      },
    ]);
    const blob = await readBlob(s, "demo://resource/session/hello.txt.gz");
    expect(gunzipSync(blob).toString()).toBe(TEXT);
  });

  it("lists the session resource and announces the list change", async () => {
    const s = await open();
    await gzip(s, { name: "listed.gz", data: DATA_URI });
    const { resources } = await s.client.listResources();
    expect(resources).toContainEqual({
      uri: "demo://resource/session/listed.gz",
      name: "listed.gz",
      mimeType: "application/gzip",
    });
    expect(
      ofMethod(s.notifications, "notifications/resources/list_changed").length,
    ).toBeGreaterThan(0);
  });

  it("embeds the gzipped data when outputType is 'resource'", async () => {
    const s = await open();
    const result = await gzip(s, {
      name: "inline.gz",
      data: DATA_URI,
      outputType: "resource",
    });
    const { resource } = contentOfType(contentOf(result)[0], "resource");
    expect(resource).toMatchObject({
      uri: "demo://resource/session/inline.gz",
      mimeType: "application/gzip",
    });
    const blob = "blob" in resource ? resource.blob : "";
    expect(gunzipSync(Buffer.from(blob, "base64")).toString()).toBe(TEXT);
  });

  it("fetches an http URL", async () => {
    const s = await open();
    await gzip(s, { name: "web.gz", data: `${base}/file.txt` });
    const blob = await readBlob(s, "demo://resource/session/web.gz");
    expect(gunzipSync(blob).toString()).toBe("served over http");
  });

  it("replaces a session resource created again under the same name", async () => {
    const s = await open();
    await gzip(s, { name: "same.gz", data: DATA_URI });
    const second = `data:text/plain;base64,${Buffer.from("second").toString("base64")}`;
    const result = await gzip(s, { name: "same.gz", data: second });
    expect(result.isError).toBeUndefined();
    const blob = await readBlob(s, "demo://resource/session/same.gz");
    expect(gunzipSync(blob).toString()).toBe("second");
  });

  it("evicts another session's resource of the same name (#4808)", async () => {
    // Characterization of #4808: session resources are tracked in one
    // module-level map keyed by URI, so the second session's registration
    // removes the first session's resource from the first session's server.
    const a = await open();
    const b = await open();
    await gzip(a, { name: "shared.gz", data: DATA_URI });
    await gzip(b, { name: "shared.gz", data: DATA_URI });

    await expect(
      a.client.readResource({ uri: "demo://resource/session/shared.gz" }),
    ).rejects.toThrow("Resource demo://resource/session/shared.gz not found");
    expect(
      gunzipSync(
        await readBlob(b, "demo://resource/session/shared.gz"),
      ).toString(),
    ).toBe(TEXT);
  });

  it("rejects a URL that is not http, https or data", async () => {
    const s = await open();
    const result = await gzip(s, { data: "ftp://example.com/file.txt" });
    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "Error processing file ftp://example.com/file.txt: Unsupported URL protocol for ftp://example.com/file.txt. Only http, https, and data URLs are supported.",
        },
      ],
    });
  });

  it("rejects something that is not a URL at input validation", async () => {
    const s = await open();
    const result = await gzip(s, { data: "not a url" });
    expect(result.isError).toBe(true);
    expect(textOf(contentOf(result)[0])).toContain("Input validation error");
  });

  it("rejects a response whose Content-Length is over 10 MB", async () => {
    const s = await open();
    const url = `${base}/claims-too-big`;
    const result = await gzip(s, { data: url });
    expect(textOf(contentOf(result)[0])).toBe(
      `Content-Length for ${url} exceeds max of ${TEN_MB}: ${TEN_MB + 1}`,
    );
  });

  it("rejects a response that streams more than 10 MB", async () => {
    const s = await open();
    const url = `${base}/streams-too-much`;
    const result = await gzip(s, { data: url });
    expect(textOf(contentOf(result)[0])).toBe(
      `Response from ${url} exceeds ${TEN_MB} bytes`,
    );
  });

  it("rejects a response with no body", async () => {
    const s = await open();
    const result = await gzip(s, { data: `${base}/empty` });
    expect(textOf(contentOf(result)[0])).toBe("No response body");
  });

  it("reports a fetch that fails", async () => {
    const s = await open();
    const result = await gzip(s, { data: "http://127.0.0.1:1/unreachable" });
    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: "fetch failed" }],
    });
  });
});
