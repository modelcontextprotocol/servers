/**
 * Characterizes the everything server's resources through the protocol
 * (#4854): reading the static documents and the dynamic templates, the errors
 * for bad template ids, and resource subscriptions with the simulated
 * `notifications/resources/updated` stream that `toggle-subscriber-updates`
 * drives. Session resources (from `gzip-file-as-resource`) are in
 * `gzip-file-as-resource.test.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connect,
  ofMethod,
  textOf,
  contentOf,
  type Session,
} from "./harness.js";

const DOCS_DIR = join(import.meta.dirname, "..", "docs");

let session: Session;

beforeEach(async () => {
  session = await connect();
});

afterEach(async () => {
  vi.useRealTimers();
  await session.close();
});

describe("static document resources", () => {
  it("serves each file in docs/ as markdown", async () => {
    for (const file of readdirSync(DOCS_DIR)) {
      const uri = `demo://resource/static/document/${encodeURIComponent(file)}`;
      const { contents } = await session.client.readResource({ uri });
      expect(contents).toEqual([
        {
          uri,
          mimeType: "text/markdown",
          text: readFileSync(join(DOCS_DIR, file), "utf-8"),
        },
      ]);
    }
  });
});

describe("dynamic resource templates", () => {
  it("fabricates a text resource from its id", async () => {
    const uri = "demo://resource/dynamic/text/42";
    const { contents } = await session.client.readResource({ uri });
    expect(contents).toEqual([
      {
        uri,
        mimeType: "text/plain",
        text: expect.stringMatching(
          /^Resource 42: This is a plaintext resource created at /,
        ),
      },
    ]);
  });

  it("fabricates a blob resource from its id, labelled application/octet-stream", async () => {
    // The content's type matches the one the blob template advertises.
    const uri = "demo://resource/dynamic/blob/9";
    const { contents } = await session.client.readResource({ uri });
    expect(contents).toEqual([
      { uri, mimeType: "application/octet-stream", blob: expect.any(String) },
    ]);
    const blob = "blob" in contents[0] ? contents[0].blob : "";
    expect(Buffer.from(blob, "base64").toString()).toMatch(
      /^Resource 9: This is a base64 blob created at /,
    );
  });

  it.each(["0", "-2", "1.5", "abc"])("rejects resource id %s", async (id) => {
    const uri = `demo://resource/dynamic/text/${id}`;
    await expect(session.client.readResource({ uri })).rejects.toThrow(
      `Unknown resource: ${uri}`,
    );
  });

  it("rejects a URI that matches no resource or template", async () => {
    await expect(
      session.client.readResource({ uri: "demo://resource/nowhere" }),
    ).rejects.toThrow("Resource not found: demo://resource/nowhere");
  });
});

describe("resource subscriptions", () => {
  const URI = "demo://resource/dynamic/text/1";

  function logData(): unknown[] {
    return ofMethod(session.notifications, "notifications/message").map(
      (n) => n.params.data,
    );
  }

  function updates(): string[] {
    return ofMethod(
      session.notifications,
      "notifications/resources/updated",
    ).map((n) => n.params.uri);
  }

  it("acknowledges subscribe and unsubscribe with a log message", async () => {
    await session.client.subscribeResource({ uri: URI });
    await session.client.unsubscribeResource({ uri: URI });
    // Unsubscribing from a URI with no subscriber set is accepted too.
    await session.client.unsubscribeResource({ uri: "demo://never" });
    expect(logData()).toEqual([
      `Received Subscribe Resource request for URI: ${URI} from session ${session.sessionId}`,
      `Received Unsubscribe Resource request: ${URI} from session ${session.sessionId}`,
      `Received Unsubscribe Resource request: demo://never from session ${session.sessionId}`,
    ]);
  });

  it("keeps another session's subscription when this one unsubscribes from the same URI", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const other = await connect();
    try {
      await other.client.subscribeResource({ uri: URI });
      // This session never subscribed; its unsubscribe changes nothing.
      await session.client.unsubscribeResource({ uri: URI });
      await other.client.callTool({
        name: "toggle-subscriber-updates",
        arguments: {},
      });
      await vi.waitFor(() =>
        expect(
          ofMethod(other.notifications, "notifications/resources/updated"),
        ).toHaveLength(1),
      );
    } finally {
      await other.close();
    }
  });

  it("omits the session from the acknowledgement when there is none (stdio)", async () => {
    await session.close();
    session = await connect({ sessionId: null });
    await session.client.subscribeResource({ uri: URI });
    await session.client.unsubscribeResource({ uri: URI });
    expect(logData()).toEqual([
      `Received Subscribe Resource request for URI: ${URI} `,
      `Received Unsubscribe Resource request: ${URI} `,
    ]);
  });

  it("sends updates for subscribed URIs every 5 seconds while toggled on", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    await session.client.subscribeResource({ uri: URI });
    await session.client.subscribeResource({ uri: URI }); // idempotent

    const on = await session.client.callTool({
      name: "toggle-subscriber-updates",
      arguments: {},
    });
    expect(textOf(contentOf(on)[0])).toBe(
      `Started simulated resource updated notifications for session ${session.sessionId} at a 5 second pace. Client will receive updates for any resources the it is subscribed to.`,
    );
    await vi.waitFor(() => expect(updates()).toEqual([URI]));

    await vi.advanceTimersByTimeAsync(5000);
    expect(updates()).toEqual([URI, URI]);

    // Unsubscribing stops updates for that URI while the interval runs on.
    await session.client.unsubscribeResource({ uri: URI });
    await vi.advanceTimersByTimeAsync(5000);
    expect(updates()).toEqual([URI, URI]);

    const off = await session.client.callTool({
      name: "toggle-subscriber-updates",
      arguments: {},
    });
    expect(textOf(contentOf(off)[0])).toBe(
      `Stopped simulated resource updates for session ${session.sessionId}`,
    );
  });

  it("stops sending updates once the toggle is turned off", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    await session.client.subscribeResource({ uri: URI });
    await session.client.callTool({
      name: "toggle-subscriber-updates",
      arguments: {},
    });
    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    await session.client.callTool({
      name: "toggle-subscriber-updates",
      arguments: {},
    });
    await vi.advanceTimersByTimeAsync(15000);
    expect(updates()).toHaveLength(1);
  });

  it("sends updates only to the sessions subscribed to a URI", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const other = await connect();
    try {
      await other.client.subscribeResource({ uri: "demo://other" });
      await session.client.subscribeResource({ uri: URI });
      await session.client.callTool({
        name: "toggle-subscriber-updates",
        arguments: {},
      });
      await other.client.callTool({
        name: "toggle-subscriber-updates",
        arguments: {},
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(new Set(updates())).toEqual(new Set([URI]));
      expect(
        new Set(
          ofMethod(other.notifications, "notifications/resources/updated").map(
            (n) => n.params.uri,
          ),
        ),
      ).toEqual(new Set(["demo://other"]));
    } finally {
      await other.close();
    }
  });

  it("drops a closed session's subscriptions without touching another session's (#4712)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const leaving = await connect();
    await leaving.client.subscribeResource({ uri: URI });
    await session.client.subscribeResource({ uri: URI });
    await leaving.close();

    // A new client under the departed session's id, which never subscribed:
    // if cleanup had left the old subscription behind, its updates would
    // reach this client.
    const returning = await connect({ sessionId: leaving.sessionId });
    try {
      await returning.client.callTool({
        name: "toggle-subscriber-updates",
        arguments: {},
      });
      await session.client.callTool({
        name: "toggle-subscriber-updates",
        arguments: {},
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(updates()).toEqual([URI, URI]);
      expect(
        ofMethod(returning.notifications, "notifications/resources/updated"),
      ).toEqual([]);
    } finally {
      await returning.close();
    }
  });

  it("logs, rather than throws, an update that cannot be sent", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await session.client.subscribeResource({ uri: URI });
      await session.client.callTool({
        name: "toggle-subscriber-updates",
        arguments: {},
      });
      // Close the client without the server-side cleanup, so the interval
      // outlives the transport, as when a connection drops.
      await session.client.close();
      await vi.advanceTimersByTimeAsync(5000);
      await vi.waitFor(() =>
        expect(errorSpy).toHaveBeenCalledWith(
          "Simulated resource update failed:",
          expect.any(Error),
        ),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
