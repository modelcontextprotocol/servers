/**
 * The everything server as a 2026-07-28 client sees it (#4852), and the tools
 * added with it as both eras see them.
 *
 * - The 2026-07-28 surface: `server/discover` (no `initialize`), the
 *   `extensions` capability, the tool list (capability-gated tools listed up
 *   front, task tools added, the 2025-only toggles absent), and the wire
 *   fields the SDK client consumes: `resultType`, and the `ttlMs` /
 *   `cacheScope` cache hints.
 * - Multi-round-trip requests written once with `inputRequired(...)`: the
 *   form, sampling, roots and URL tools on 2026-07-28 (2025-era coverage,
 *   through the SDK's legacy shim, is in sampling-elicitation.test.ts and
 *   roots.test.ts), `requestState` carried across the multi-step tool's
 *   rounds on both eras, with retries after missing or bad input, and the
 *   SDK refusing an embedded request whose capability the request did not
 *   declare (-32021) or a tampered state (-32602).
 * - Per-request log levels (`trigger-log-messages`) against the 2025-era
 *   session level.
 * - Change notifications (`trigger-list-changed`, `trigger-resource-update`)
 *   on a `subscriptions/listen` stream, and unsolicited or after
 *   `resources/subscribe` on 2025-era sessions.
 * - Minted resources: `gzip-file-as-resource` links on 2026-07-28.
 *
 * Over stdio, `get-header-params` sees no header; streamable-http.test.ts
 * covers its `Mcp-Param-Region` header.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { gunzipSync } from "node:zlib";
import type {
  Client,
  ElicitRequest,
  ElicitResult,
} from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { CACHE_HINTS } from "../server/index.js";
import { instancePublisher } from "../server/context.js";
import { STATIC_DOCUMENT_CACHE_HINT } from "../resources/files.js";
import {
  clearMintedResources,
  MAX_MINTED_BYTES,
  MAX_MINTED_RESOURCES,
  MINTED_RESOURCE_TTL_MS,
  mintBlobResource,
} from "../resources/minted.js";
import { LOGGING_LEVELS } from "../tools/trigger-log-messages.js";
import {
  ALL_CAPABILITIES,
  connect,
  connectModern,
  connectRaw,
  contentOf,
  MODERN_CAPABILITIES,
  ofMethod,
  textOf,
  type RawSession,
  type Session,
} from "./harness.js";

let session: Session | undefined;
let raw: RawSession | undefined;

afterEach(async () => {
  await session?.close();
  await raw?.close();
  session = undefined;
  raw = undefined;
  clearMintedResources();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The text blocks of a `tools/call` result. */
function texts(result: object): string[] {
  return contentOf(result).map(textOf);
}

describe("the 2026-07-28 surface", () => {
  it("answers server/discover with the capabilities, the tasks extension and a cache hint", async () => {
    raw = await connectRaw({});
    const discover = await raw.result("server/discover");
    expect(discover).toMatchObject({
      supportedVersions: expect.arrayContaining(["2026-07-28"]),
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        logging: {},
        extensions: { "io.modelcontextprotocol/tasks": {} },
      },
      resultType: "complete",
      ...CACHE_HINTS["server/discover"],
      _meta: {
        "io.modelcontextprotocol/serverInfo": {
          name: "mcp-servers/everything",
        },
      },
    });
  });

  it("advertises no extensions to a 2025-era client", async () => {
    session = await connect();
    expect(session.client.getServerCapabilities()?.extensions).toBeUndefined();
  });

  it("marks the task-creating tools as not read-only", async () => {
    session = await connectModern();
    const { tools } = await session.client.listTools();
    for (const name of [
      "simulate-research-query",
      "trigger-sampling-request-async",
      "trigger-elicitation-request-async",
    ]) {
      expect(
        tools.find((t) => t.name === name)?.annotations?.readOnlyHint,
      ).toBe(false);
    }
  });

  it("lists the capability-gated and task tools up front, and not the 2025-only toggles", async () => {
    session = await connectModern();
    expect(session.client.getProtocolEra()).toBe("modern");
    const names = (await session.client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get-roots-list",
        "trigger-elicitation-request",
        "trigger-multi-step-elicitation",
        "trigger-url-elicitation",
        "trigger-sampling-request",
        "simulate-research-query",
        "trigger-sampling-request-async",
        "trigger-elicitation-request-async",
      ]),
    );
    expect(names).not.toContain("toggle-simulated-logging");
    expect(names).not.toContain("toggle-subscriber-updates");
  });

  it.each([
    ["tools/list", "tools/list"],
    ["prompts/list", "prompts/list"],
    ["resources/list", "resources/list"],
    ["resources/templates/list", "resources/templates/list"],
  ] as const)("stamps %s with its cache hint", async (method, hint) => {
    raw = await connectRaw({});
    expect(await raw.result(method)).toMatchObject({
      resultType: "complete",
      ...CACHE_HINTS[hint],
    });
  });

  it("stamps a static document read with its own, longer cache hint", async () => {
    raw = await connectRaw({});
    const read = await raw.result("resources/read", {
      uri: "demo://resource/static/document/instructions.md",
    });
    expect(read).toMatchObject(STATIC_DOCUMENT_CACHE_HINT);
  });

  it("stamps a dynamic resource read as uncacheable", async () => {
    raw = await connectRaw({});
    const read = await raw.result("resources/read", {
      uri: "demo://resource/dynamic/text/1",
    });
    expect(read).toMatchObject({ ttlMs: 0, cacheScope: "private" });
  });

  it("answers a read of a resource that does not exist with -32602", async () => {
    raw = await connectRaw({});
    const uri = "demo://resource/dynamic/text/0";
    const response = await raw.request("resources/read", { uri });
    expect(response.error).toMatchObject({ code: -32602, data: { uri } });
  });

  it("stamps a tool result with resultType", async () => {
    raw = await connectRaw({});
    expect(await raw.call("echo", { message: "hi" })).toEqual(
      expect.objectContaining({
        resultType: "complete",
        content: [{ type: "text", text: "Echo: hi" }],
      }),
    );
  });

  it("reports no header for get-header-params over stdio", async () => {
    session = await connectModern();
    const result = await session.client.callTool({
      name: "get-header-params",
      arguments: { region: "eu-west", repeat: 2 },
    });
    expect(result.structuredContent).toEqual({
      region: "eu-west",
      regionHeader: null,
      repeated: ["eu-west", "eu-west"],
    });
  });

  it("repeats the region once by default", async () => {
    session = await connectModern();
    const result = await session.client.callTool({
      name: "get-header-params",
      arguments: { region: "ap-south" },
    });
    expect(result.structuredContent).toMatchObject({ repeated: ["ap-south"] });
  });

  it("validates get-header-params arguments against its JSON Schema", async () => {
    session = await connectModern();
    const result = await session.client.callTool({
      name: "get-header-params",
      arguments: { region: "eu-west", repeat: 9 },
    });
    expect(result.isError).toBe(true);
    expect(texts(result)[0]).toContain("must be <= 3");
  });
});

describe("multi-round-trip requests on 2026-07-28", () => {
  /** A 2026-07-28 client answering form elicitations with `answer`. */
  async function withElicitation(
    answer: (request: ElicitRequest) => ElicitResult,
  ) {
    const asked: ElicitRequest["params"][] = [];
    session = await connectModern({
      capabilities: ALL_CAPABILITIES,
      setup: (client) =>
        client.setRequestHandler("elicitation/create", async (request) => {
          asked.push(request.params);
          return answer(request);
        }),
    });
    return { client: session.client, asked };
  }

  it("fills in the form in-band", async () => {
    const { client, asked } = await withElicitation(() => ({
      action: "accept",
      content: { name: "Ada" },
    }));
    const result = await client.callTool({
      name: "trigger-elicitation-request",
      arguments: {},
    });
    expect(asked).toHaveLength(1);
    expect(texts(result).slice(0, 2)).toEqual([
      "✅ User provided the requested information!",
      "User inputs:\n- Name: Ada",
    ]);
  });

  it("samples in-band", async () => {
    session = await connectModern({
      capabilities: ALL_CAPABILITIES,
      setup: (client) =>
        client.setRequestHandler("sampling/createMessage", async () => ({
          role: "assistant",
          model: "m",
          content: { type: "text", text: "sampled" },
        })),
    });
    const result = await session.client.callTool({
      name: "trigger-sampling-request",
      arguments: { prompt: "p" },
    });
    expect(texts(result)[0]).toContain('"text": "sampled"');
  });

  it("lists the roots in-band", async () => {
    session = await connectModern({
      capabilities: ALL_CAPABILITIES,
      setup: (client) =>
        client.setRequestHandler("roots/list", async () => ({
          roots: [{ uri: "file:///w", name: "W" }],
        })),
    });
    const result = await session.client.callTool({
      name: "get-roots-list",
      arguments: {},
    });
    expect(texts(result)[0]).toMatch(/^Current MCP Roots \(1 total\)/);
  });

  it.each([
    [
      "accept",
      "✅ User completed the URL elicitation flow.\nURL: https://example.com/auth",
    ],
    ["decline", "❌ User declined to open the URL."],
    ["cancel", "⚠️ User cancelled the URL elicitation."],
  ] as const)(
    "reports a URL elicitation the user chose to %s",
    async (action, text) => {
      const { client, asked } = await withElicitation(() => ({ action }));
      const result = await client.callTool({
        name: "trigger-url-elicitation",
        arguments: { url: "https://example.com/auth", errorPath: true },
      });
      // No -32042 error path on 2026-07-28: the URL comes in-band, with no id.
      expect(asked).toEqual([
        expect.objectContaining({
          mode: "url",
          url: "https://example.com/auth",
        }),
      ]);
      expect(asked[0]).not.toHaveProperty("elicitationId");
      expect(texts(result)[0]).toBe(text);
    },
  );

  it("refuses an embedded request the client's request did not declare (-32021)", async () => {
    raw = await connectRaw({});
    const response = await raw.request("tools/call", {
      name: "trigger-sampling-request",
      arguments: { prompt: "p" },
    });
    expect(response.error).toMatchObject({ code: -32021 });
  });

  it("refuses a tampered requestState with -32602 before the tool runs", async () => {
    raw = await connectRaw({ elicitation: {} });
    const response = await raw.request("tools/call", {
      name: "trigger-multi-step-elicitation",
      arguments: {},
      requestState: "tampered",
      inputResponses: {},
    });
    expect(response.error).toMatchObject({ code: -32602 });
  });

  it("returns input_required with a signed requestState on the wire", async () => {
    raw = await connectRaw({ elicitation: {} });
    const first = await raw.call("trigger-multi-step-elicitation");
    expect(first).toMatchObject({
      resultType: "input_required",
      inputRequests: { name: { method: "elicitation/create" } },
      requestState: expect.any(String),
    });
  });
});

describe("trigger-multi-step-elicitation", () => {
  /** Run the tool for a client that answers each question from `answers`. */
  async function run(
    connectTo: typeof connect | typeof connectModern,
    answers: ElicitResult[],
  ) {
    const asked: string[] = [];
    session = await connectTo({
      capabilities: { elicitation: { form: {} } },
      setup: (client: Client) =>
        client.setRequestHandler("elicitation/create", async (request) => {
          asked.push(request.params.message);
          return answers.shift() ?? { action: "cancel" };
        }),
    });
    const result = await session.client.callTool({
      name: "trigger-multi-step-elicitation",
      arguments: {},
    });
    return { result, asked };
  }

  it.each([
    ["2026-07-28", connectModern],
    ["2025-11-25", connect],
  ] as const)(
    "carries the name to the color question on %s",
    async (_era, connectTo) => {
      const { result, asked } = await run(connectTo, [
        { action: "accept", content: { name: "Ada" } },
        { action: "accept", content: { color: "green" } },
      ]);
      expect(asked).toEqual([
        "What is your name?",
        "Thanks, Ada. Which color do you like best?",
      ]);
      expect(texts(result)).toEqual(["Ada's favorite color is green."]);
      expect(result.structuredContent).toEqual({
        name: "Ada",
        color: "green",
      });
    },
  );

  it("asks again after a blank name or a color that is not a choice", async () => {
    const { result, asked } = await run(connectModern, [
      { action: "accept", content: { name: "  " } },
      { action: "accept", content: { name: "Ada" } },
      { action: "accept", content: { color: "mauve" } },
      { action: "accept", content: { color: "red" } },
    ]);
    expect(asked).toEqual([
      "What is your name?",
      "A name is required. What is your name?",
      "Thanks, Ada. Which color do you like best?",
      "Thanks, Ada. Which color do you like best?",
    ]);
    expect(texts(result)).toEqual(["Ada's favorite color is red."]);
  });

  it.each([
    [
      [{ action: "decline" as const }],
      "Stopped: the user chose decline at the name question.",
    ],
    [
      [
        { action: "accept" as const, content: { name: "Ada" } },
        { action: "cancel" as const },
      ],
      "Stopped: the user chose cancel at the color question.",
    ],
  ])("stops when the user declines or cancels: %j", async (answers, text) => {
    const { result } = await run(connectModern, [...answers]);
    expect(result.isError).toBe(true);
    expect(texts(result)).toEqual([text]);
  });
});

describe("trigger-log-messages", () => {
  /** The levels of the log messages a `trigger-log-messages` call delivered. */
  async function levelsFrom(s: Session, logLevel?: string): Promise<string[]> {
    const levels: string[] = [];
    s.client.setNotificationHandler("notifications/message", (n) => {
      levels.push(n.params.level);
    });
    const result = await s.client.callTool({
      name: "trigger-log-messages",
      arguments: {},
      ...(logLevel && {
        _meta: { "io.modelcontextprotocol/logLevel": logLevel },
      }),
    });
    expect(texts(result)[0]).toMatch(
      /^Sent one log message at each of 8 levels/,
    );
    return levels;
  }

  it("sends the levels at or above the one the 2026-07-28 request names", async () => {
    session = await connectModern();
    expect(await levelsFrom(session, "error")).toEqual(
      LOGGING_LEVELS.slice(LOGGING_LEVELS.indexOf("error")),
    );
  });

  it("sends nothing to a 2026-07-28 request that names no level", async () => {
    session = await connectModern();
    expect(await levelsFrom(session)).toEqual([]);
  });

  it("follows the level a 2025-era client set for the session", async () => {
    session = await connect();
    await session.client.setLoggingLevel("critical");
    expect(await levelsFrom(session)).toEqual([
      "critical",
      "alert",
      "emergency",
    ]);
  });
});

describe("change notifications", () => {
  const URI = "demo://resource/dynamic/text/1";

  /** Resolves with the next notification of `method` the client receives. */
  function next(
    client: Client,
    method:
      | "notifications/resources/updated"
      | "notifications/tools/list_changed"
      | "notifications/prompts/list_changed"
      | "notifications/resources/list_changed",
  ) {
    return new Promise<unknown>((resolve) => {
      client.setNotificationHandler(method, (n) => resolve(n.params ?? {}));
    });
  }

  it.each([
    ["tools", "toolsListChanged", "notifications/tools/list_changed"],
    ["prompts", "promptsListChanged", "notifications/prompts/list_changed"],
    [
      "resources",
      "resourcesListChanged",
      "notifications/resources/list_changed",
    ],
  ] as const)(
    "delivers a %s list change on a 2026-07-28 listen stream that asked for it",
    async (list, filter, method) => {
      session = await connectModern();
      const subscription = await session.client.listen({ [filter]: true });
      const arrived = next(session.client, method);
      const result = await session.client.callTool({
        name: "trigger-list-changed",
        arguments: { list },
      });
      expect(texts(result)).toEqual([
        `Sent notifications/${list}/list_changed`,
      ]);
      await arrived;
      await subscription.close();
    },
  );

  it("delivers a resource update on a 2026-07-28 listen stream that named the URI", async () => {
    session = await connectModern();
    const subscription = await session.client.listen({
      resourceSubscriptions: [URI],
    });
    const arrived = next(session.client, "notifications/resources/updated");
    const result = await session.client.callTool({
      name: "trigger-resource-update",
      arguments: { uri: URI },
    });
    expect(texts(result)).toEqual([
      `Sent notifications/resources/updated for ${URI} to each subscriber`,
    ]);
    // The listen stream stamps the notification with its subscription id.
    expect(await arrived).toMatchObject({ uri: URI });
    await subscription.close();
  });

  it("sends a 2025-era client a list change unsolicited", async () => {
    session = await connect();
    const arrived = next(session.client, "notifications/prompts/list_changed");
    await session.client.callTool({
      name: "trigger-list-changed",
      arguments: { list: "prompts" },
    });
    await arrived;
  });

  it("sends a 2025-era client a resource update only once it has subscribed", async () => {
    session = await connect();
    const s = session;
    const updates = () =>
      ofMethod(s.notifications, "notifications/resources/updated");
    await s.client.callTool({
      name: "trigger-resource-update",
      arguments: { uri: URI },
    });
    await s.client.ping();
    expect(updates()).toEqual([]);

    const arrived = next(s.client, "notifications/resources/updated");
    await s.client.subscribeResource({ uri: URI });
    await s.client.callTool({
      name: "trigger-resource-update",
      arguments: { uri: URI },
    });
    expect(await arrived).toEqual({ uri: URI });
  });

  it.each(["toolsChanged", "promptsChanged", "resourcesChanged"] as const)(
    "logs, rather than leaves unhandled, a %s notification that cannot be sent",
    async (method) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const server = new McpServer({ name: "s", version: "0" });
      vi.spyOn(server, "isConnected").mockReturnValue(true);
      const failure = new Error("closed");
      vi.spyOn(server.server, "sendToolListChanged").mockRejectedValue(failure);
      vi.spyOn(server.server, "sendPromptListChanged").mockRejectedValue(
        failure,
      );
      vi.spyOn(server.server, "sendResourceListChanged").mockRejectedValue(
        failure,
      );
      instancePublisher(server, () => true)[method]();
      await vi.waitFor(() =>
        expect(error).toHaveBeenCalledWith(
          "Change notification failed:",
          failure,
        ),
      );
    },
  );

  it("sends no list change from an instance with no connection", () => {
    const server = new McpServer({ name: "s", version: "0" });
    const send = vi.spyOn(server.server, "sendToolListChanged");
    instancePublisher(server, () => true).toolsChanged();
    expect(send).not.toHaveBeenCalled();
  });

  it("logs, rather than throws, a resource update that cannot be sent", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = new McpServer({ name: "s", version: "0" });
    const failure = new Error("closed");
    vi.spyOn(server.server, "sendResourceUpdated").mockRejectedValue(failure);
    instancePublisher(server, () => true).resourceUpdated(URI);
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        "Change notification failed:",
        failure,
      ),
    );
  });
});

describe("minted resources", () => {
  const DATA_URI = `data:text/plain;base64,${Buffer.from("hello, minted").toString("base64")}`;

  async function mint(): Promise<string> {
    session = await connectModern();
    const result = await session.client.callTool({
      name: "gzip-file-as-resource",
      arguments: { name: "note.txt.gz", data: DATA_URI },
    });
    const [link] = contentOf(result);
    expect(link).toMatchObject({
      type: "resource_link",
      name: "note.txt.gz",
      mimeType: "application/gzip",
      uri: expect.stringMatching(
        /^demo:\/\/resource\/minted\/[0-9a-f-]{36}\/note\.txt\.gz$/,
      ),
    });
    return (link as { uri: string }).uri;
  }

  it("links a 2026-07-28 client to a resource it can read later", async () => {
    const uri = await mint();
    const { contents } = await session!.client.readResource({ uri });
    const blob = (contents[0] as { blob: string }).blob;
    expect(gunzipSync(Buffer.from(blob, "base64")).toString()).toBe(
      "hello, minted",
    );
  });

  it("can be read by another 2026-07-28 connection that has the URI", async () => {
    const uri = await mint();
    const other = await connectModern();
    try {
      const { contents } = await other.client.readResource({ uri });
      expect(contents).toHaveLength(1);
    } finally {
      await other.close();
    }
  });

  it("expires after its TTL, and then reads as not found (-32602)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const uri = await mint();
    vi.setSystemTime(Date.now() + MINTED_RESOURCE_TTL_MS);
    await expect(session!.client.readResource({ uri })).rejects.toMatchObject({
      code: -32602,
      data: { uri },
    });
  });

  it("keeps at most MAX_MINTED_RESOURCES, dropping the oldest", async () => {
    const first = mintBlobResource("first", "text/plain", "AA==").uri;
    for (let i = 1; i < MAX_MINTED_RESOURCES; i++) {
      mintBlobResource(`r${i}`, "text/plain", "AA==");
    }
    session = await connectModern();
    expect(await session.client.readResource({ uri: first })).toMatchObject({
      contents: [{ uri: first }],
    });
    mintBlobResource("one-more", "text/plain", "AA==");
    await expect(
      session.client.readResource({ uri: first }),
    ).rejects.toMatchObject({ code: -32602 });
  });

  it("refuses one resource larger than the whole byte budget", () => {
    expect(() =>
      mintBlobResource("huge", "text/plain", "A".repeat(MAX_MINTED_BYTES)),
    ).toThrow(
      /^Cannot keep huge for later reading: its \d+ bytes exceed the \d+-byte limit for minted resources$/,
    );
  });

  it("counts a resource's name and URI against the byte budget", async () => {
    // Two resources whose content alone fits, but not with their names.
    const name = "n".repeat(1024);
    const blob = "A".repeat(MAX_MINTED_BYTES / 2 - 1024);
    const first = mintBlobResource(name, "text/plain", blob).uri;
    mintBlobResource(name, "text/plain", blob);
    session = await connectModern();
    await expect(
      session.client.readResource({ uri: first }),
    ).rejects.toMatchObject({ code: -32602 });
  });

  it("refuses a gzip-file-as-resource name longer than it will keep", async () => {
    session = await connectModern();
    const result = await session.client.callTool({
      name: "gzip-file-as-resource",
      arguments: { name: "n".repeat(256), data: DATA_URI },
    });
    expect(result.isError).toBe(true);
  });

  it("keeps at most MAX_MINTED_BYTES of content, dropping the oldest", async () => {
    const half = "A".repeat(MAX_MINTED_BYTES / 2);
    const first = mintBlobResource("first", "text/plain", half).uri;
    const second = mintBlobResource("second", "text/plain", half).uri;
    mintBlobResource("third", "text/plain", "AA==");
    session = await connectModern();
    await expect(
      session.client.readResource({ uri: first }),
    ).rejects.toMatchObject({ code: -32602 });
    expect(
      (await session.client.readResource({ uri: second })).contents,
    ).toHaveLength(1);
  });

  it("is not served to a 2025-era client", async () => {
    session = await connect();
    const { resourceTemplates } = await session.client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.name)).not.toContain(
      "Minted Resource",
    );
  });

  it("lists nothing, so a URI is reached only through the tool's link", async () => {
    session = await connectModern({ capabilities: MODERN_CAPABILITIES });
    const { resources } = await session.client.listResources();
    expect(resources.some((r) => r.uri.includes("/minted/"))).toBe(false);
  });
});
